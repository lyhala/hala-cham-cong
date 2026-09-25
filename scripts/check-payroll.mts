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
  bonusUnits: 0,
  annualLeaveDays: 0,
  otherPaidLeaveDays: 0,
  unpaidLeaveDays: 0,
  otHours: 0,
  otUnits: 0,
  parkingOutside: false,
  latePenalty: 0,
  advanceDeduction: 0,
  leavePayoutDays: 0,
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

// ── Công bù (Admin sửa công vượt công của ngày): tính vào Tổng công, KHÔNG giới hạn trần, chỉ nhân với lương base ──
const bonus = calcPayslip({ ...base, attendanceUnits: 22, bonusUnits: 3 }, params);
check("Đủ 22 công + bù 3 → công thực vẫn 22, tổng công 25/22", [bonus.actualWorkUnits, bonus.bonusUnits, bonus.totalUnits], [22, 3, 25]);
check("Lương theo công = base × 25 ÷ 22 (lương tăng)", bonus.salaryByUnits, Math.round((10_000_000 * 25) / 22));
check("Performance không đổi khi có công bù (chỉ tính theo lương performance × hệ số)", bonus.perfActual, calcPayslip({ ...base, attendanceUnits: 22 }, params).perfActual);
check("Hỗ trợ cơm chỉ theo công thực (không tính công bù)", bonus.mealAllowance, 1_250_000);
check("Công bù bù vào chỗ thiếu: chấm công 21 + bù 1 → tổng công 22", calcPayslip({ ...base, attendanceUnits: 21, bonusUnits: 1 }, params).totalUnits, 22);
check("Chấm công vượt trần vẫn bị chặn ở 22 (chỉ công bù mới vượt)", calcPayslip({ ...base, attendanceUnits: 23, bonusUnits: 0 }, params).actualWorkUnits, 22);
check("Không giới hạn trần: bù 30 công (đền bù 1 tháng lương) → tổng công 52/22", calcPayslip({ ...base, attendanceUnits: 22, bonusUnits: 30 }, params).totalUnits, 52);
check("Đền bù 22 công = thêm đúng 1 tháng lương base", calcPayslip({ ...base, attendanceUnits: 22, bonusUnits: 22 }, params).salaryByUnits, 20_000_000);
// ── Bảng lương ↔ Google Sheet (§14.1) ──
import { HEADER, LAST_COLUMN, buildSheetValues, calcTotalCost, columnLetter, parseMoneyCell, parseSheetValues, spreadsheetIdFromUrl, type SheetPayslipRow } from "../src/lib/payroll-sheet";

const row = (over: Partial<SheetPayslipRow>): SheetPayslipRow => ({
  code: "NV001", name: "Ninh Thành Vinh", team: "Joe", baseSalary: 10_000_000, perfSalary: 5_000_000, perfCoefficient: 0.8, annualLeaveUsed: 0, unpaidLeaveDays: 0,
  actualWorkUnits: 22, standardWorkDays: 22, otHours: 0, totalUnits: 22, salaryByUnits: 10_000_000, perfActual: 4_000_000, mealAllowance: 1_250_000,
  parkingAllowance: 0, latePenalty: 0, advanceDeduction: 0, leaveDaysPaidOut: 0, leavePayout: 0, bonusUnits: 0, netPay: 15_250_000, bhxhEmployee: null, bhxhCompany: null, tax: null, ...over,
});

check("Tổng chi phí = thực nhận + BHXH NLĐ + BHXH cty + thuế", calcTotalCost(15_250_000, { bhxhEmployee: 1_050_000, bhxhCompany: 2_200_000, tax: 300_000 }), 18_800_000);
check("Chưa điền gì → chưa có tổng chi phí", calcTotalCost(15_250_000, { bhxhEmployee: null, bhxhCompany: null, tax: null }), null);
check("Điền 1 ô, ô trống tính 0", calcTotalCost(15_250_000, { bhxhEmployee: null, bhxhCompany: 2_200_000, tax: null }), 17_450_000);
check("Điền 0 rõ ràng vẫn tính", calcTotalCost(15_250_000, { bhxhEmployee: 0, bhxhCompany: 0, tax: 0 }), 15_250_000);

check("Ô '1.250.000' → số", parseMoneyCell("1.250.000"), 1_250_000);
check("Ô '1,250,000 đ' → số", parseMoneyCell("1,250,000 đ"), 1_250_000);
check("Ô số 1250000.4 → làm tròn", parseMoneyCell(1250000.4), 1_250_000);
check("Ô trống → null", parseMoneyCell(""), null);
check("Ô chữ → invalid", parseMoneyCell("abc"), "invalid");
check("Ô số âm → invalid", parseMoneyCell(-5), "invalid");
check("Cột 0=A, 25=Z, 26=AA", [columnLetter(0), columnLetter(25), columnLetter(26)], ["A", "Z", "AA"]);
check("Cột cuối của tab", LAST_COLUMN, "Z");

const built = buildSheetValues([row({}), row({ code: "NV002", name: "B", netPay: 1 })]);
check("Có dòng tiêu đề + 2 dòng nhân sự", built.length, 3);
check("Tiêu đề có 26 cột (22 cột hệ thống + BHXH NLĐ + BHXH cty + Thuế + Tổng chi phí)", built[0].length, 26);
check("Dòng 2 có công thức tổng chi phí", built[1][25], "=V2+SUM(W2:Y2)");
check("Dòng 3 có công thức tổng chi phí", built[2][25], "=V3+SUM(W3:Y3)");
check("Xuất lần đầu: 3 ô HR trống", built[1].slice(22, 25), ["", "", ""]);

// Xuất lại: giữ số HR đã gõ trên Sheet; ô trống thì lấy số lưu trong hệ thống
const again = buildSheetValues([row({ tax: 100 }), row({ code: "NV002" })], new Map([["NV001", { bhxhEmployee: 999, bhxhCompany: null, tax: null }]]));
check("Giữ số đang gõ trên Sheet", again[1][22], 999);
check("Ô Sheet trống → lấy số trong hệ thống", again[1][24], 100);
check("Người khác không bị ảnh hưởng", again[2].slice(22, 25), ["", "", ""]);

// Đọc lại từ Sheet (thứ tự cột có thể bị HR đổi)
const sheet: unknown[][] = [
  ["Thuế", "Mã NV", "BHXH (NLĐ trả)", "BHXH (công ty trả)", "Thực nhận"],
  [300000, "nv001", 1050000, "2.200.000", 15250000],
  ["", "NV002", "", "", 1],
  ["", "", "", "", ""],
  ["x", "NV003", 1, 2, 3],
];
const parsed = parseSheetValues(sheet);
check("Đọc đúng dòng hợp lệ", parsed.rows, [
  { code: "NV001", bhxhEmployee: 1_050_000, bhxhCompany: 2_200_000, tax: 300_000 },
  { code: "NV002", bhxhEmployee: null, bhxhCompany: null, tax: null },
]);
check("Báo lỗi dòng có chữ", parsed.errors.length, 1);
check("Lỗi ghi rõ dòng và mã NV", parsed.errors[0].includes("Dòng 5 (NV003)"), true);
check("Tab sai định dạng bị báo", parseSheetValues([["a", "b"]]).errors.length, 1);
check("Thiếu cột Thuế bị báo", parseSheetValues([[HEADER.code, HEADER.bhxhEmployee, HEADER.bhxhCompany]]).errors[0].includes("Thuế"), true);

check("Lấy ID từ link Sheet", spreadsheetIdFromUrl("https://docs.google.com/spreadsheets/d/1AbC_-x9/edit#gid=0"), "1AbC_-x9");
check("Link không phải Sheet", spreadsheetIdFromUrl("https://example.com/spreadsheets/d/abc"), null);
// ── Quy đổi phép tồn ra lương (§4): khoản cộng RIÊNG vào Thực nhận, không nằm trong công ──
const leaveSlip = calcPayslip({ ...base, attendanceUnits: 22, leavePayoutDays: 5 }, params);
check("Phép tồn 5 ngày = 10tr ÷ 22 × 5 = 2.272.727", [leaveSlip.leaveDaysPaidOut, leaveSlip.leavePayout], [5, 2_272_727]);
check("Phép tồn KHÔNG làm đổi tổng công / lương theo công", [leaveSlip.totalUnits, leaveSlip.salaryByUnits], [22, 10_000_000]);
check("Thực nhận cộng riêng tiền quy đổi phép", leaveSlip.netPay, 10_000_000 + 4_000_000 + 1_250_000 + 2_272_727);
check("Không có phép tồn → không cộng gì", calcPayslip({ ...base, attendanceUnits: 22 }, params).leavePayout, 0);
check("Ngày công tháng = 0 → tiền quy đổi = 0", calcPayslip({ ...base, standardDays: 0, leavePayoutDays: 5 }, params).leavePayout, 0);
check("Cả công bù 3 và phép tồn 5: lương theo công theo 25/22, phép tồn cộng riêng", (() => { const r = calcPayslip({ ...base, attendanceUnits: 22, bonusUnits: 3, leavePayoutDays: 5 }, params); return [r.salaryByUnits, r.leavePayout, r.netPay - r.salaryByUnits - r.perfActual - r.mealAllowance]; })(), [Math.round((10_000_000 * 25) / 22), 2_272_727, 2_272_727]);
console.log(failed ? `\n${failed} lỗi` : "\nTất cả đều đúng");
process.exit(failed ? 1 : 0);
