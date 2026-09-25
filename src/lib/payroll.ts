// Công thức tính lương (spec §6.1) và hệ số performance (§8). Hàm thuần: không đụng DB để dễ kiểm tra.
// Tiền làm tròn về đồng (Int); số công làm tròn 2 chữ số.

import type { SettingValue } from "@/lib/settings";

export type SalaryParams = SettingValue<"salaryParams">;

const round2 = (n: number) => Math.round(n * 100) / 100;

export type PayrollInput = {
  standardDays: number; // Ngày công tháng (đếm từ lịch làm việc)
  baseSalary: number; // Lương base đang hiệu lực trong tháng
  perfSalary: number; // Lương performance đang hiệu lực trong tháng
  perfCoefficient: number; // Hệ số performance (0–1)
  attendanceUnits: number; // Tổng công từ bảng chấm công (đã tính thiếu giờ, trừ ½ công đi muộn sau 10h...), KHÔNG gồm công bù
  bonusUnits: number; // Công BÙ do Admin sửa tay vượt công của ngày — cộng thêm ngoài trần ngày công tháng
  annualLeaveDays: number; // Nghỉ phép năm: hưởng lương → tính vào công thực
  otherPaidLeaveDays: number; // Nghỉ kết hôn / tang lễ: hưởng nguyên lương → tính vào công thực
  unpaidLeaveDays: number; // Nghỉ không lương: chỉ để hiển thị (đã không có trong công chấm)
  otHours: number;
  otUnits: number; // Công OT (đã nhân hệ số), xem calcOtUnits
  parkingOutside: boolean; // Gửi xe ngoài → được tiền gửi xe
  latePenalty: number; // Tổng phạt đi muộn tháng, đã trừ các ngày được miễn
  advanceDeduction: number; // Tạm ứng lương trong tháng
  leavePayoutDays: number; // Số ngày phép tồn quy đổi ra lương (tháng 12 / tháng nghỉ việc), 0 nếu không phải
};

export type PayrollResult = {
  standardWorkDays: number;
  baseSalary: number;
  perfSalary: number;
  perfCoefficient: number;
  annualLeaveUsed: number;
  unpaidLeaveDays: number;
  actualWorkUnits: number; // Công thực
  otHours: number;
  otUnits: number;
  totalUnits: number; // Tổng công
  salaryByUnits: number; // Lương theo tổng công
  perfActual: number; // Performance thực
  mealAllowance: number; // Hỗ trợ cơm
  parkingAllowance: number; // Tiền gửi xe
  latePenalty: number;
  advanceDeduction: number;
  leaveDaysPaidOut: number; // Số ngày phép tồn được quy đổi
  leavePayout: number; // Tiền quy đổi phép tồn
  netPay: number; // Thực nhận
};

/**
 * Thực nhận = Lương theo tổng công + Performance thực + Hỗ trợ cơm + Tiền gửi xe + Phép tồn quy đổi − Phạt đi muộn − Tạm ứng
 *  - Công thực = công chấm công + phép năm + nghỉ hưởng lương khác (không vượt ngày công tháng)
 *  - Lương theo tổng công = base × Tổng công ÷ Ngày công tháng (Tổng công = Công thực + Công OT)
 *  - Hỗ trợ cơm và Tiền gửi xe tính theo Công thực (không tính OT)
 */
export function calcPayslip(input: PayrollInput, params: SalaryParams): PayrollResult {
  const std = input.standardDays;
  // Công thực bị chặn trần ở ngày công tháng (tránh tính trùng phép + chấm công), công bù được cộng thêm ngoài trần
  const actual = round2(Math.min(std, input.attendanceUnits + input.annualLeaveDays + input.otherPaidLeaveDays) + input.bonusUnits);
  const total = round2(actual + input.otUnits);

  const salaryByUnits = std > 0 ? Math.round((input.baseSalary * total) / std) : 0;
  const perfActual = Math.round(input.perfSalary * input.perfCoefficient);
  const mealAllowance = std > 0 ? Math.round((params.mealAllowancePerMonth / std) * actual) : 0;
  const parkingAllowance = input.parkingOutside ? Math.round(params.parkingPerDay * actual) : 0;
  // Phép tồn quy đổi = lương base ÷ ngày công chuẩn của tháng × số ngày phép tồn
  const leavePayout = std > 0 ? Math.round((input.baseSalary / std) * input.leavePayoutDays) : 0;
  const netPay = salaryByUnits + perfActual + mealAllowance + parkingAllowance + leavePayout - input.latePenalty - input.advanceDeduction;

  return {
    standardWorkDays: std,
    baseSalary: input.baseSalary,
    perfSalary: input.perfSalary,
    perfCoefficient: input.perfCoefficient,
    annualLeaveUsed: input.annualLeaveDays,
    unpaidLeaveDays: input.unpaidLeaveDays,
    actualWorkUnits: actual,
    otHours: input.otHours,
    otUnits: input.otUnits,
    totalUnits: total,
    salaryByUnits,
    perfActual,
    mealAllowance,
    parkingAllowance,
    latePenalty: input.latePenalty,
    advanceDeduction: input.advanceDeduction,
    leaveDaysPaidOut: input.leavePayoutDays,
    leavePayout,
    netPay,
  };
}

/** Công OT = (Giờ OT ÷ 7.5) × Hệ số OT — cần đơn OT đã duyệt; hệ số theo ngày thường / cuối tuần / lễ tết. */
export function calcOtUnits(hours: { weekday: number; weekend: number; holiday: number }, params: SalaryParams, hoursPerDay = 7.5) {
  const c = params.otCoefficients;
  return round2(((hours.weekday * c.weekday + hours.weekend * c.weekend + hours.holiday * c.holiday) / hoursPerDay));
}

/**
 * Hệ số performance = Σ(điểm tiêu chí 0–5 × trọng số %) ÷ 5.
 * Tiêu chí chưa có điểm tính 0 điểm; tháng chưa có điểm nào thì hệ số = 0 (nhân sự chưa được chấm thì chưa nhận performance).
 */
export function calcPerfCoefficient(criteria: { weight: number; score: number | null }[]) {
  if (criteria.every((c) => c.score == null)) return 0;
  const sum = criteria.reduce((s, c) => s + ((c.score ?? 0) * c.weight) / 100, 0);
  return Math.round((sum / 5) * 10000) / 10000;
}
