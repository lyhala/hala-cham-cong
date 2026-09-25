// Chính sách lưu trữ dữ liệu (spec §17): xóa dữ liệu quá hạn khỏi database, chạy hằng ngày bằng `npm run retention`.
// File này không import "server-only" và nhận PrismaClient từ ngoài để chạy được cả từ script (cron) lẫn kiểm tra.
//
// Cách tính hạn: theo THÁNG DƯƠNG LỊCH, giữ nguyên các tháng còn trong hạn và cả tháng hiện tại.
// VD hôm nay 09/2026, hạn 3 tháng → giữ từ 06/2026 trở đi, xóa mọi dữ liệu trước ngày 01/06/2026.

import type { PrismaClient } from "@/generated/prisma/client";
import { currentMonthVN, shiftMonth } from "@/lib/dates";
import { SETTING_DEFAULTS } from "@/lib/settings";

export type RetentionConfig = typeof SETTING_DEFAULTS.retention;

/** Ngày đầu tháng "YYYY-MM" dạng Date 00:00 UTC — để so với cột @db.Date. */
const monthStartDate = (month: string) => new Date(`${month}-01T00:00:00Z`);
/** Ngày đầu tháng "YYYY-MM" theo giờ VN — để so với cột thời gian (DateTime). */
const monthStartVN = (month: string) => new Date(`${month}-01T00:00:00+07:00`);

/** Các mốc cắt: dữ liệu TRƯỚC mốc này bị xóa. */
export function retentionCutoffs(config: RetentionConfig, now = new Date()) {
  const current = currentMonthVN(now);
  const attendanceMonth = shiftMonth(current, -config.attendanceMonths);
  const requestMonth = shiftMonth(current, -config.requestMonths);
  return {
    payslipMonth: shiftMonth(current, -config.payslipMonths), // xóa Payslip.month < mốc
    allocationMonth: shiftMonth(current, -config.allocationMonths), // xóa ProjectAllocation.month < mốc
    attendanceMonth,
    attendanceDate: monthStartDate(attendanceMonth), // xóa DailyAttendance.date < mốc
    attendanceTime: monthStartVN(attendanceMonth), // xóa AttendanceLog.time < mốc
    requestMonth,
    requestDate: monthStartDate(requestMonth),
    requestTime: monthStartVN(requestMonth),
    reportMonth: shiftMonth(current, -config.reportMonths), // tháng cũ nhất còn xem lại được báo cáo
  };
}

/**
 * Báo cáo Chi phí dự án / theo Team không lưu bảng riêng mà tính lúc xem, nên chỉ xem lại được tối đa
 * `reportMonths` tháng gần nhất (dữ liệu nguồn — phiếu lương, hệ số — còn thì mới tính được).
 * Quá hạn: báo không tính lại được, phải tra file Google Sheet đã xuất.
 */
export function reportMonthAvailability(month: string, config: RetentionConfig, now = new Date()) {
  const oldest = retentionCutoffs(config, now).reportMonth;
  if (month >= oldest) return { available: true as const };
  return {
    available: false as const,
    message: `Tháng ${month} đã quá ${config.reportMonths} tháng nên hệ thống không tính lại được. Vui lòng tra file Google Sheet đã xuất.`,
  };
}

export type RetentionResult = Record<"payslips" | "attendanceLogs" | "dailyAttendance" | "allocations" | "requests", number>;

/**
 * Xóa dữ liệu quá hạn. dryRun = chỉ đếm, không xóa.
 * Đơn từ: xóa khi đơn được tạo trước mốc VÀ ngày nghỉ/làm thêm trong đơn cũng trước mốc (đơn xin nghỉ cho
 * tương lai không bị xóa sớm). Hệ số phân bổ chỉ xóa trong database — file Google Sheet giữ nguyên.
 */
export async function runRetention(prisma: PrismaClient, options: { dryRun?: boolean; now?: Date } = {}) {
  const stored = await prisma.setting.findUnique({ where: { key: "retention" } });
  const config: RetentionConfig = { ...SETTING_DEFAULTS.retention, ...((stored?.value as Partial<RetentionConfig> | null) ?? {}) };
  const cut = retentionCutoffs(config, options.now);

  const where = {
    payslips: { month: { lt: cut.payslipMonth } },
    attendanceLogs: { time: { lt: cut.attendanceTime } },
    dailyAttendance: { date: { lt: cut.attendanceDate } },
    allocations: { month: { lt: cut.allocationMonth } },
    requests: {
      createdAt: { lt: cut.requestTime },
      AND: [{ OR: [{ dateFrom: null }, { dateFrom: { lt: cut.requestDate } }] }, { OR: [{ dateTo: null }, { dateTo: { lt: cut.requestDate } }] }],
    },
  };

  const run = async (count: () => Promise<number>, del: () => Promise<{ count: number }>) => (options.dryRun ? count() : (await del()).count);
  const result: RetentionResult = {
    payslips: await run(() => prisma.payslip.count({ where: where.payslips }), () => prisma.payslip.deleteMany({ where: where.payslips })),
    attendanceLogs: await run(() => prisma.attendanceLog.count({ where: where.attendanceLogs }), () => prisma.attendanceLog.deleteMany({ where: where.attendanceLogs })),
    dailyAttendance: await run(() => prisma.dailyAttendance.count({ where: where.dailyAttendance }), () => prisma.dailyAttendance.deleteMany({ where: where.dailyAttendance })),
    allocations: await run(() => prisma.projectAllocation.count({ where: where.allocations }), () => prisma.projectAllocation.deleteMany({ where: where.allocations })),
    requests: await run(() => prisma.request.count({ where: where.requests }), () => prisma.request.deleteMany({ where: where.requests })),
  };

  const total = Object.values(result).reduce((a, b) => a + b, 0);
  if (!options.dryRun && total > 0) {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        action: "retention.run",
        summary: `Xóa dữ liệu quá hạn: ${result.payslips} phiếu lương, ${result.attendanceLogs} log Hanet, ${result.dailyAttendance} dòng công, ${result.allocations} hệ số phân bổ, ${result.requests} đơn từ`,
      },
    });
  }
  return { result, cutoffs: cut, dryRun: !!options.dryRun };
}
