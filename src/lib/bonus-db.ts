import "server-only";

import { isValidMonth } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { calculateMonth } from "@/lib/payroll-db";

// Công BÙ: Admin nhập RIÊNG theo nhân sự + tháng (đền bù ngày phép, đền bù chuyến du lịch không đi được, thậm chí cả 1 tháng lương...).
// Cộng vào Tổng công của phiếu lương tháng đó, KHÔNG giới hạn trần, chỉ nhân với lương base (performance không liên quan).
// Tách hẳn khỏi sửa công: sửa công chỉ để chỉnh cho khớp thực tế (quên checkout, máy lỗi...), tối đa đủ công của ngày.

export type BonusResult = { ok: true; message: string } | { ok: false; error: string };

const MAX_UNITS = 1000; // Chỉ chặn số vô lý (thường do nhập nhầm dấu chấm / phẩy)

/** Thêm 1 khoản công bù cho nhân sự ở tháng `month`; nếu phiếu lương tháng đó đã tính thì tính lại luôn. */
export async function addWorkBonus(input: { employeeId: string; month: string; units: number; note: string; adminId: string }): Promise<BonusResult> {
  const { employeeId, month, note } = input;
  const units = Math.round(input.units * 100) / 100;
  if (!isValidMonth(month)) return { ok: false, error: "Tháng không hợp lệ" };
  if (!Number.isFinite(units) || units <= 0) return { ok: false, error: "Số công bù phải lớn hơn 0" };
  if (units > MAX_UNITS) return { ok: false, error: "Số công bù quá lớn — kiểm tra lại (VD nhập nhầm dấu chấm / phẩy)" };
  if (!note.trim()) return { ok: false, error: "Vui lòng nhập lý do bù công" };
  if (note.length > 200) return { ok: false, error: "Lý do quá dài (tối đa 200 ký tự)" };
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) return { ok: false, error: "Không tìm thấy nhân sự" };

  await prisma.workUnitBonus.create({ data: { employeeId, month, units, note: note.trim(), createdById: input.adminId } });
  await recalcIfCalculated(employeeId, month);
  return { ok: true, message: `Đã thêm ${units} công bù cho tháng ${month}` };
}

export async function deleteWorkBonus(id: string): Promise<BonusResult & { employeeId?: string; month?: string; units?: number }> {
  const row = await prisma.workUnitBonus.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Không tìm thấy khoản công bù" };
  await prisma.workUnitBonus.delete({ where: { id } });
  await recalcIfCalculated(row.employeeId, row.month);
  return { ok: true, message: "Đã xóa khoản công bù", employeeId: row.employeeId, month: row.month, units: row.units };
}

/** Phiếu lương tháng đó đã có → tính lại để công bù có hiệu lực ngay; chưa có thì công bù được áp dụng ở lần "Tính lương". */
async function recalcIfCalculated(employeeId: string, month: string) {
  const exists = await prisma.payslip.findUnique({ where: { employeeId_month: { employeeId, month } }, select: { id: true } });
  if (exists) await calculateMonth(month, employeeId);
}
