import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getMonthSummaries, loadMonthCalendar } from "@/lib/attendance";
import { prisma } from "@/lib/db";
import { calcOtUnits, calcPayslip, calcPerfCoefficient, type PayrollResult, type SalaryParams } from "@/lib/payroll";
import { calcTotalCost } from "@/lib/payroll-sheet";
import { shiftMonth } from "@/lib/dates";
import { hoursBetween, leaveUnitsInMonth, otDayKind } from "@/lib/requests";
import { getSetting } from "@/lib/settings-db";

// Cột số liệu của phiếu lương — dùng cho cả bản tính (Payslip) lẫn bản đã gửi cho nhân sự (publishedData).
export const PAYSLIP_FIELDS = [
  "standardWorkDays", "baseSalary", "perfSalary", "perfCoefficient", "annualLeaveUsed", "unpaidLeaveDays",
  "actualWorkUnits", "otHours", "otUnits", "totalUnits", "salaryByUnits", "perfActual",
  "mealAllowance", "parkingAllowance", "latePenalty", "advanceDeduction", "netPay",
] as const satisfies readonly (keyof PayrollResult)[];

export function pickPayslipFields(p: PayrollResult): PayrollResult {
  return Object.fromEntries(PAYSLIP_FIELDS.map((k) => [k, p[k]])) as PayrollResult;
}

const monthEnd = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)); // ngày cuối tháng
};

/** Phiếu cần Gửi / Gửi lại: chưa gửi lần nào, hoặc số liệu hiện tại khác bản nhân sự đang thấy. */
export function needsSend(p: { publishedData: unknown } & Partial<Record<keyof PayrollResult, unknown>>) {
  if (!p.publishedData) return true;
  const published = p.publishedData as Partial<PayrollResult>;
  return PAYSLIP_FIELDS.some((k) => published[k] !== p[k]);
}

export type CalcSummary = { calculated: number; missingSalary: { code: string; name: string }[] };

/**
 * Tính (hoặc tính lại) phiếu lương của 1 tháng "YYYY-MM" cho mọi nhân sự (hoặc 1 người nếu có employeeId).
 * Dữ liệu vào: bảng chấm công + phạt đi muộn, lương base/performance đang hiệu lực (lấy mốc hiệu lực mới nhất
 * tính đến NGÀY CUỐI THÁNG), hệ số performance từ điểm đã sync.
 * Đơn từ đã duyệt (OT, nghỉ phép/không lương, WFH, tạm ứng) được lấy ở `requestAdjustments`.
 * Nhân sự chưa có mốc lương thì bỏ qua và trả về trong missingSalary (không tạo phiếu 0đ).
 * Giữ nguyên trạng thái Đã gửi / bản đã gửi; chỉ cập nhật số liệu mới.
 */
export async function calculateMonth(month: string, employeeId?: string): Promise<CalcSummary> {
  const [summaries, params, criteria, calendar] = await Promise.all([
    getMonthSummaries(month, { forPayroll: true }),
    getSetting("salaryParams"),
    prisma.performanceCriterion.findMany({ select: { id: true, weight: true } }),
    loadMonthCalendar(month),
  ]);
  const people = summaries.rows.filter((r) => !employeeId || r.id === employeeId);
  const ids = people.map((p) => p.id);
  const adjustments = await requestAdjustments(month, ids, calendar, params);

  const [history, scores] = await Promise.all([
    prisma.salaryHistory.findMany({
      where: { employeeId: { in: ids }, effectiveFrom: { lte: monthEnd(month) } },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    }),
    prisma.performanceScore.findMany({ where: { employeeId: { in: ids }, month } }),
  ]);
  const salaryOf = new Map<string, (typeof history)[number]>();
  for (const h of history) if (!salaryOf.has(h.employeeId)) salaryOf.set(h.employeeId, h);

  const missingSalary: CalcSummary["missingSalary"] = [];
  let calculated = 0;
  for (const p of people) {
    const salary = salaryOf.get(p.id);
    if (!salary) {
      missingSalary.push({ code: p.code, name: p.name });
      continue;
    }
    const mine = scores.filter((s) => s.employeeId === p.id);
    const perfCoefficient = calcPerfCoefficient(
      criteria.map((c) => ({ weight: c.weight, score: mine.find((s) => s.criterionId === c.id)?.score ?? null })),
    );

    const result = calcPayslip(
      {
        standardDays: summaries.standardDays,
        baseSalary: salary.baseSalary,
        perfSalary: salary.perfSalary,
        perfCoefficient,
        attendanceUnits: p.workUnits,
        parkingOutside: p.parkingOutside,
        latePenalty: p.latePenalty,
        ...(adjustments.get(p.id) ?? NO_ADJUSTMENTS),
      },
      params,
    );
    // Tính lại làm Thực nhận đổi → Tổng chi phí (nếu HR đã điền BHXH/Thuế) phải tính lại theo; các số HR giữ nguyên
    const existing = await prisma.payslip.findUnique({ where: { employeeId_month: { employeeId: p.id, month } } });
    await prisma.payslip.upsert({
      where: { employeeId_month: { employeeId: p.id, month } },
      create: { employeeId: p.id, month, ...result },
      update: { ...result, calculatedAt: new Date(), ...(existing ? { totalCost: calcTotalCost(result.netPay, existing) } : {}) },
    });
    calculated++;
  }
  return { calculated, missingSalary };
}

const NO_ADJUSTMENTS = { annualLeaveDays: 0, otherPaidLeaveDays: 0, unpaidLeaveDays: 0, otHours: 0, otUnits: 0, advanceDeduction: 0 };

/**
 * Lấy từ Đơn từ ĐÃ DUYỆT (chưa xóa) của tháng:
 *  - Nghỉ phép → annualLeaveDays; nghỉ kết hôn / tang lễ / WFH → otherPaidLeaveDays (tính vào công thực, hưởng nguyên lương)
 *  - Nghỉ không lương → unpaidLeaveDays (chỉ hiển thị — ngày đó không có công nên tự bị trừ)
 *  - OT → giờ OT theo loại ngày (thường / cuối tuần / lễ) rồi ra công OT nhân hệ số
 *  - Tạm ứng → trừ hết vào lương tháng của ngày tạo đơn (giờ VN)
 * Đơn nghỉ chỉ đếm ngày làm việc trong tháng đó; đơn nghỉ qua tháng thì mỗi tháng tính phần của mình.
 */
async function requestAdjustments(month: string, employeeIds: string[], calendar: Awaited<ReturnType<typeof loadMonthCalendar>>, params: SalaryParams) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const requests = await prisma.request.findMany({
    where: {
      employeeId: { in: employeeIds },
      status: "APPROVED",
      deletedAt: null,
      OR: [
        { type: "SALARY_ADVANCE", createdAt: { gte: new Date(`${month}-01T00:00:00+07:00`), lt: new Date(`${shiftMonth(month, 1)}-01T00:00:00+07:00`) } },
        { type: { in: ["OT", "LEAVE", "WFH"] }, dateFrom: { lt: end }, dateTo: { gte: start } },
      ],
    },
  });

  const dayInfo = new Map(calendar.days.map((d) => [d.day, d]));
  const workday = (day: string) => dayInfo.get(day)?.workday ?? false;
  const result = new Map<string, typeof NO_ADJUSTMENTS>();
  const ot = new Map<string, { weekday: number; weekend: number; holiday: number }>();
  const get = (id: string) => result.get(id) ?? result.set(id, { ...NO_ADJUSTMENTS }).get(id)!;

  for (const r of requests) {
    const adj = get(r.employeeId);
    const from = r.dateFrom?.toISOString().slice(0, 10);
    const to = r.dateTo?.toISOString().slice(0, 10);
    if (r.type === "SALARY_ADVANCE") {
      adj.advanceDeduction += r.amount ?? 0;
    } else if (r.type === "OT" && from?.startsWith(month) && r.timeFrom && r.timeTo) {
      const hours = ot.get(r.employeeId) ?? { weekday: 0, weekend: 0, holiday: 0 };
      hours[otDayKind({ isHoliday: dayInfo.get(from)?.isHoliday ?? false, workday: workday(from) })] += hoursBetween(r.timeFrom, r.timeTo);
      ot.set(r.employeeId, hours);
    } else if ((r.type === "LEAVE" || r.type === "WFH") && from && to) {
      const units = leaveUnitsInMonth({ dateFrom: from, dateTo: to, dayPortion: r.dayPortion }, month, workday);
      if (r.type === "WFH" || r.leaveSubtype === "MARRIAGE" || r.leaveSubtype === "FUNERAL") adj.otherPaidLeaveDays += units;
      else if (r.leaveSubtype === "UNPAID") adj.unpaidLeaveDays += units;
      else adj.annualLeaveDays += units;
    }
  }
  for (const [id, hours] of ot) {
    const adj = get(id);
    adj.otHours = Math.round((hours.weekday + hours.weekend + hours.holiday) * 100) / 100;
    adj.otUnits = calcOtUnits(hours, params);
  }
  return result;
}

/**
 * Gửi phiếu lương cho nhân sự: chụp số liệu hiện tại vào publishedData, đánh dấu Đã gửi, báo thông báo.
 * Áp dụng cho phiếu chưa gửi, hoặc đã gửi nhưng số liệu đã đổi sau khi tính lại (Gửi lại). Trả về số phiếu đã gửi.
 */
export async function sendPayslips(month: string, employeeId?: string) {
  const payslips = await prisma.payslip.findMany({ where: { month, ...(employeeId ? { employeeId } : {}) } });
  const toSend = payslips.filter((p) => needsSend(p));

  const now = new Date();
  for (const p of toSend) {
    const data = pickPayslipFields(p as unknown as PayrollResult);
    await prisma.payslip.update({
      where: { id: p.id },
      data: { status: "SENT", sentAt: now, publishedData: data as unknown as Prisma.InputJsonValue },
    });
    await prisma.notification.create({
      data: { employeeId: p.employeeId, type: "PAYSLIP_SENT", title: `Phiếu lương tháng ${month.slice(5)}/${month.slice(0, 4)} đã được gửi`, link: `/salary?month=${month}` },
    });
  }
  return toSend.length;
}
