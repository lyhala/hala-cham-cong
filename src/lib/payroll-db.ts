import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getMonthSummaries } from "@/lib/attendance";
import { prisma } from "@/lib/db";
import { calcPayslip, calcPerfCoefficient, type PayrollResult } from "@/lib/payroll";
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
 * Đơn từ (OT, nghỉ phép/không lương, tạm ứng) chưa có module → tạm để 0; nối vào ở `leaveAndAdjustments`.
 * Nhân sự chưa có mốc lương thì bỏ qua và trả về trong missingSalary (không tạo phiếu 0đ).
 * Giữ nguyên trạng thái Đã gửi / bản đã gửi; chỉ cập nhật số liệu mới.
 */
export async function calculateMonth(month: string, employeeId?: string): Promise<CalcSummary> {
  const [summaries, params, criteria] = await Promise.all([
    getMonthSummaries(month, { forPayroll: true }),
    getSetting("salaryParams"),
    prisma.performanceCriterion.findMany({ select: { id: true, weight: true } }),
  ]);
  const people = summaries.rows.filter((r) => !employeeId || r.id === employeeId);
  const ids = people.map((p) => p.id);

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
        ...leaveAndAdjustments(),
      },
      params,
    );
    await prisma.payslip.upsert({
      where: { employeeId_month: { employeeId: p.id, month } },
      create: { employeeId: p.id, month, ...result },
      update: { ...result, calculatedAt: new Date() },
    });
    calculated++;
  }
  return { calculated, missingSalary };
}

/** Nghỉ phép / nghỉ không lương / OT / tạm ứng của tháng. TODO: lấy từ Đơn từ đã duyệt khi module Đơn từ xong. */
function leaveAndAdjustments() {
  return { annualLeaveDays: 0, otherPaidLeaveDays: 0, unpaidLeaveDays: 0, otHours: 0, otUnits: 0, advanceDeduction: 0 };
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
