// Kiểm tra công thức lương (spec §6.1, §8) — không cần database. Chạy: npm run check:payroll

import { calcOtUnits, calcPayslip, calcPerfCoefficient, type PayrollInput } from "../src/lib/payroll";
import { SETTING_DEFAULTS } from "../src/lib/settings";

const params = SETTING_DEFAULTS.salaryParams;
let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok ? "" : ` — mong đợi ${JSON.stringify(want)}, nhận ${JSON.stringify(got)}`}`);
}

const base: PayrollInput = {
  standardDays: 22,
  baseSalary: 10_000_000,
  perfSalary: 5_000_000,
  perfCoefficient: 0.8,
  attendanceUnits: 21.5,
  annualLeaveDays: 0,
  otherPaidLeaveDays: 0,
  unpaidLeaveDays: 0,
  otHours: 0,
  otUnits: 0,
  parkingOutside: false,
  latePenalty: 0,
  advanceDeduction: 0,
};

// Đi làm 21,5/22 công, performance 0,8
const a = calcPayslip(base, params);
check("Lương theo công = 10tr × 21,5 / 22", a.salaryByUnits, 9_772_727);
check("Performance thực = 5tr × 0,8", a.perfActual, 4_000_000);
check("Hỗ trợ cơm = 1,25tr / 22 × 21,5", a.mealAllowance, 1_221_591);
check("Không gửi xe ngoài → 0", a.parkingAllowance, 0);
check("Thực nhận", a.netPay, 9_772_727 + 4_000_000 + 1_221_591);

// Gửi xe ngoài, có phạt và tạm ứng
const b = calcPayslip({ ...base, attendanceUnits: 22, parkingOutside: true, latePenalty: 25_000, advanceDeduction: 2_000_000 }, params);
check("Đủ công: lương = base", b.salaryByUnits, 10_000_000);
check("Gửi xe = 5.000 × 22", b.parkingAllowance, 110_000);
check("Thực nhận trừ phạt và tạm ứng", b.netPay, 10_000_000 + 4_000_000 + 1_250_000 + 110_000 - 25_000 - 2_000_000);

// Phép năm tính vào công thực; không vượt ngày công tháng
const c = calcPayslip({ ...base, attendanceUnits: 20, annualLeaveDays: 2 }, params);
check("20 công + 2 ngày phép = 22 công thực", c.actualWorkUnits, 22);
check("Công thực không vượt ngày công tháng", calcPayslip({ ...base, attendanceUnits: 23 }, params).actualWorkUnits, 22);

// OT: 1 công OT cộng vào tổng công nhưng KHÔNG vào cơm / gửi xe
const ot = calcOtUnits({ weekday: 0, weekend: 7.5, holiday: 0 }, params);
check("7,5h OT cuối tuần = 1 × 2 = 2 công", ot, 2);
const d = calcPayslip({ ...base, attendanceUnits: 22, otHours: 7.5, otUnits: ot, parkingOutside: true }, params);
check("Tổng công = 22 + 2", d.totalUnits, 24);
check("Lương theo tổng công có OT", d.salaryByUnits, Math.round((10_000_000 * 24) / 22));
check("Cơm không tính OT", d.mealAllowance, 1_250_000);
check("Gửi xe không tính OT", d.parkingAllowance, 110_000);

// Hệ số performance (§8)
const full = [{ weight: 30, score: 5 }, { weight: 70, score: 5 }];
check("Điểm 5/5 → hệ số 1", calcPerfCoefficient(full), 1);
check("Điểm 4 mọi tiêu chí → 0,8", calcPerfCoefficient([{ weight: 30, score: 4 }, { weight: 70, score: 4 }]), 0.8);
check("Chưa có điểm nào → 0", calcPerfCoefficient([{ weight: 100, score: null }]), 0);
check("Thiếu 1 tiêu chí tính 0 điểm", calcPerfCoefficient([{ weight: 50, score: 5 }, { weight: 50, score: null }]), 0.5);

// Tháng chưa có ngày công (lịch trống) không chia cho 0
check("Ngày công tháng = 0 → không lỗi", calcPayslip({ ...base, standardDays: 0 }, params).salaryByUnits, 0);

console.log(failed ? `\n${failed} lỗi` : "\nTất cả đều đúng");
process.exit(failed ? 1 : 0);
