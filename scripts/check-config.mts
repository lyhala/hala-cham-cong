// Kiểm tra phần kiểm tra dữ liệu nhập ở màn Cấu hình — không cần database. Chạy: npm run check:config

import { parseApprovalLevels, parseCriteria, parseLatePenalty, parseLeavePolicy, parsePayslipLines, parseRetention, parseRolePermissions, parseSalaryParams, parseSheetLinks, parseWorkSchedule, type Form } from "../src/lib/config-validate";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok ? "" : ` — mong đợi ${JSON.stringify(want)}, nhận ${JSON.stringify(got)}`}`);
}

/** Form giả: giá trị đơn hoặc mảng (nhiều checkbox cùng tên). */
const form = (data: Record<string, string | string[]>): Form => ({
  get: (k) => (Array.isArray(data[k]) ? data[k][0] : (data[k] ?? null)),
  getAll: (k) => (data[k] === undefined ? [] : Array.isArray(data[k]) ? data[k] : [data[k]]),
});
const has = (r: { error?: string }, text: string) => r.error?.includes(text) ?? false;

// Giờ làm việc: mặc định + giờ riêng từng thứ
const weekdays = (days: number[], extra: Record<string, string> = {}) => ({ ...Object.fromEntries(days.map((d) => [`work_${d}`, "on"])), ...extra });
const ws = { morningStart: "08:30", morningEnd: "12:00", afternoonStart: "13:30", afternoonEnd: "17:30", ...weekdays([1, 2, 3, 4, 5]) };
check("Giờ làm việc hợp lệ, không có giờ riêng", parseWorkSchedule(form(ws)).value, { morningStart: "08:30", morningEnd: "12:00", afternoonStart: "13:30", afternoonEnd: "17:30", workWeekdays: [1, 2, 3, 4, 5], daySchedules: {} });
check("Mốc giờ không tăng dần bị chặn", has(parseWorkSchedule(form({ ...ws, morningEnd: "08:00" })), "tăng dần"), true);
check("Giờ sai định dạng bị chặn", has(parseWorkSchedule(form({ ...ws, afternoonEnd: "25:00" })), "HH:mm"), true);
check("Không chọn ngày làm nào bị chặn", has(parseWorkSchedule(form({ morningStart: "08:30", morningEnd: "12:00", afternoonStart: "13:30", afternoonEnd: "17:30" })), "ít nhất 1 ngày"), true);
check("Làm cả T7 (giờ trống = dùng giờ mặc định, không lưu giờ riêng)", parseWorkSchedule(form({ ...ws, ...weekdays([1, 2, 3, 4, 5, 6]) })).value?.workWeekdays, [1, 2, 3, 4, 5, 6]);
check("Form điền sẵn giờ mặc định cho T7 → vẫn không lưu giờ riêng", Object.keys(parseWorkSchedule(form({ ...ws, ...weekdays([1, 2, 3, 4, 5, 6]), ms_6: "08:30", me_6: "12:00", as_6: "13:30", ae_6: "17:30" })).value?.daySchedules ?? {}), []);
check("Thứ 7 chỉ làm sáng (bỏ trống 2 ô buổi chiều) → lưu giờ riêng", parseWorkSchedule(form({ ...ws, ...weekdays([1, 2, 3, 4, 5, 6]), ms_6: "08:30", me_6: "12:00", as_6: "", ae_6: "" })).value?.daySchedules, { "6": { morningStart: "08:30", morningEnd: "12:00", afternoonStart: null, afternoonEnd: null, unit: null } });
check("Chủ nhật chỉ làm chiều, số công đặt tay 0,5", parseWorkSchedule(form({ ...ws, ...weekdays([1, 2, 3, 4, 5, 0]), ms_0: "", me_0: "", as_0: "13:30", ae_0: "17:30", unit_0: "0,5" })).value?.daySchedules["0"], { morningStart: null, morningEnd: null, afternoonStart: "13:30", afternoonEnd: "17:30", unit: 0.5 });
check("Thứ 7 giờ khác mặc định (8h00–11h30)", parseWorkSchedule(form({ ...ws, ...weekdays([1, 2, 3, 4, 5, 6]), ms_6: "08:00", me_6: "11:30", as_6: "", ae_6: "" })).value?.daySchedules["6"]?.morningStart, "08:00");
check("Chỉ đặt số công riêng (giờ để trống) → dùng giờ mặc định nhưng lưu số công", parseWorkSchedule(form({ ...ws, ...weekdays([1, 2, 3, 4, 5, 6]), unit_6: "0.5" })).value?.daySchedules["6"]?.unit, 0.5);
check("Buổi sáng chỉ nhập 1 ô bị chặn", has(parseWorkSchedule(form({ ...ws, ...weekdays([1, 2, 3, 4, 5, 6]), ms_6: "08:30", me_6: "", as_6: "", ae_6: "" })), "đủ giờ vào và giờ ra"), true);
check("Giờ ra trước giờ vào bị chặn", has(parseWorkSchedule(form({ ...ws, ...weekdays([1, 2, 3, 4, 5, 6]), ms_6: "12:00", me_6: "08:30", as_6: "", ae_6: "" })), "sau giờ vào"), true);
check("Buổi chiều bắt đầu trước khi hết buổi sáng bị chặn", has(parseWorkSchedule(form({ ...ws, ...weekdays([1, 2, 3, 4, 5, 6]), ms_6: "08:30", me_6: "12:00", as_6: "11:00", ae_6: "15:00" })), "sau khi hết buổi sáng"), true);
check("Số công 1,5 bị chặn", has(parseWorkSchedule(form({ ...ws, ...weekdays([1, 2, 3, 4, 5, 6]), unit_6: "1.5" })), "tối đa 1"), true);
check("Thứ không tick thì bỏ qua giờ riêng", Object.keys(parseWorkSchedule(form({ ...ws, ms_6: "08:30", me_6: "12:00", as_6: "", ae_6: "" })).value?.daySchedules ?? {}), []);
// Bảng phạt
const lp = { tierFrom0: "08:31", tierTo0: "08:45", tierRate0: "1.000", tierFrom1: "08:46", tierTo1: "09:00", tierRate1: "2000", halfDayAfter: "10:00", freeExemptionsPerMonth: "3" };
check("Bảng phạt hợp lệ (dòng trống bỏ qua)", parseLatePenalty(form(lp), "08:30").value, {
  tiers: [{ from: "08:31", to: "08:45", perMinute: 1000 }, { from: "08:46", to: "09:00", perMinute: 2000 }],
  halfDayAfter: "10:00",
  freeExemptionsPerMonth: 3,
});
check("Khung chồng nhau bị chặn", has(parseLatePenalty(form({ ...lp, tierFrom1: "08:40" }), "08:30"), "chồng"), true);
check("Khung bắt đầu trước giờ vào ca bị chặn", has(parseLatePenalty(form({ ...lp, tierFrom0: "08:00" }), "08:30"), "sau giờ vào ca"), true);
check("Khung cuối vượt mốc trừ ½ công bị chặn", has(parseLatePenalty(form({ ...lp, tierTo1: "10:30" }), "08:30"), "không muộn hơn"), true);
check("Thiếu mức phạt bị chặn", has(parseLatePenalty(form({ ...lp, tierRate0: "" }), "08:30"), "mức phạt"), true);
check("Số lần miễn phạt 40 bị chặn", has(parseLatePenalty(form({ ...lp, freeExemptionsPerMonth: "40" }), "08:30"), "0 đến 31"), true);
check("Nhập khung theo thứ tự lộn xộn vẫn được sắp lại", parseLatePenalty(form({ ...lp, tierFrom0: "08:46", tierTo0: "09:00", tierRate0: "2000", tierFrom1: "08:31", tierTo1: "08:45", tierRate1: "1000" }), "08:30").value?.tiers[0].from, "08:31");

// Tham số lương, phép năm
const sp = { mealAllowancePerMonth: "1.250.000", parkingPerDay: "5000", otWeekday: "1,5", otWeekend: "2", otHoliday: "3" };
check("Tham số lương hợp lệ", parseSalaryParams(form(sp)).value, { mealAllowancePerMonth: 1_250_000, parkingPerDay: 5000, otCoefficients: { weekday: 1.5, weekend: 2, holiday: 3 } });
check("Hệ số OT bằng 0 bị chặn", has(parseSalaryParams(form({ ...sp, otWeekend: "0" })), "Hệ số OT"), true);
check("Phép năm hợp lệ", parseLeavePolicy(form({ daysPerMonth: "1", probationMonths: "2" })).value, { daysPerMonth: 1, probationMonths: 2 });
check("Phép 6 ngày/tháng bị chặn", has(parseLeavePolicy(form({ daysPerMonth: "6", probationMonths: "2" })), "mỗi tháng"), true);
check("Thử việc 2,5 tháng bị chặn", has(parseLeavePolicy(form({ daysPerMonth: "1", probationMonths: "2.5" })), "thử việc"), true);

// Duyệt đơn / quyền / phiếu lương
const levels = { level_OT: "2", level_LATE: "1", level_EARLY_LEAVE: "1", level_LEAVE: "1", level_WFH: "1", level_SALARY_ADVANCE: "2" };
check("Cách duyệt theo loại đơn", parseApprovalLevels(form(levels)).value, { OT: 2, LATE: 1, EARLY_LEAVE: 1, LEAVE: 1, WFH: 1, SALARY_ADVANCE: 2 });
check("Thiếu 1 loại đơn bị chặn", has(parseApprovalLevels(form({ ...levels, level_WFH: "" })), "mọi loại đơn"), true);
check("Quyền theo role (tick = bật)", parseRolePermissions(form({ leader_approve: "on", employee_wfh: "on" })).value, { leader: { approve: true }, employee: { wfh: true, advance: false } });
check("Dòng phiếu lương (tick = hiện)", parsePayslipLines(form({ line_baseSalary: "on", line_ot: "on" })).value?.baseSalary, true);
check("Dòng không tick = ẩn", parsePayslipLines(form({ line_baseSalary: "on" })).value?.perfSalary, false);

// Lưu trữ, link Sheet
const rt = { payslipMonths: "12", attendanceMonths: "3", allocationMonths: "12", requestMonths: "3", reportMonths: "12" };
check("Lưu trữ hợp lệ", parseRetention(form(rt)).value, { payslipMonths: 12, attendanceMonths: 3, allocationMonths: 12, requestMonths: 3, reportMonths: 12 });
check("Lưu trữ 0 tháng bị chặn", has(parseRetention(form({ ...rt, attendanceMonths: "0" })), "1 đến 120"), true);
check("Link Sheet hợp lệ + ô trống = chưa dùng", parseSheetLinks(form({ payrollSheetUrl: "https://docs.google.com/spreadsheets/d/abc123/edit", performanceSheetUrl: "" })).value?.performanceSheetUrl, null);
check("Link không phải Sheet bị chặn", has(parseSheetLinks(form({ payrollSheetUrl: "https://example.com/x" })), "không hợp lệ"), true);
check("Performance dùng chung file với Bảng lương bị chặn", has(parseSheetLinks(form({ payrollSheetUrl: "https://docs.google.com/spreadsheets/d/AAA/edit", performanceSheetUrl: "https://docs.google.com/spreadsheets/d/AAA/edit#gid=1" })), "cùng 1 file"), true);
check("Hai file khác nhau thì hợp lệ", parseSheetLinks(form({ payrollSheetUrl: "https://docs.google.com/spreadsheets/d/AAA/edit", performanceSheetUrl: "https://docs.google.com/spreadsheets/d/BBB/edit" })).error, undefined);

// Tiêu chí Performance
const criteria = (rows: { id?: string; name: string; weight: string; group?: string; remove?: boolean }[]) =>
  form(Object.fromEntries(rows.flatMap((r, i) => [[`id${i}`, r.id ?? ""], [`name${i}`, r.name], [`weight${i}`, r.weight], [`group${i}`, r.group ?? "BASE"], ...(r.remove ? [[`remove${i}`, "on"]] : [])])));
check("Tiêu chí tổng 100% hợp lệ", parseCriteria(criteria([{ id: "a", name: "CV", weight: "60" }, { name: "Teamwork", weight: "40" }])).value?.length, 2);
check("Tổng 90% bị chặn, báo rõ tổng hiện tại", has(parseCriteria(criteria([{ id: "a", name: "CV", weight: "60" }, { name: "Teamwork", weight: "30" }])), "90%"), true);
check("Tên trùng nhau bị chặn", has(parseCriteria(criteria([{ name: "CV", weight: "50" }, { name: "cv", weight: "50" }])), "trùng"), true);
check("Trọng số chữ bị chặn", has(parseCriteria(criteria([{ name: "CV", weight: "abc" }])), "trọng số"), true);
check("Xóa 1 tiêu chí rồi tổng còn lại = 100% thì hợp lệ", parseCriteria(criteria([{ id: "a", name: "CV", weight: "100" }, { id: "b", name: "Cũ", weight: "20", remove: true }])).value?.filter((r) => r.remove).length, 1);
check("Xóa hết tiêu chí bị chặn", has(parseCriteria(criteria([{ id: "a", name: "CV", weight: "100", remove: true }])), "ít nhất 1"), true);

// ── Đọc điểm Performance từ Google Sheet ──
import { buildPerfTemplate, parsePerfSheet, parseScoreCell, perfTabName } from "../src/lib/performance-sheet";
const crit = [{ id: "c1", name: "Hoàn thành CV" }, { id: "c2", name: "Teamwork" }];
check("Tên tab theo tháng = YYYY-MM", perfTabName("2026-09"), "2026-09");
check("Tab mẫu: tiêu đề + 1 dòng/nhân sự, ô điểm trống", buildPerfTemplate(crit, [{ code: "NV001", name: "A", team: "Joe" }, { code: "NV002", name: "B", team: null }]), [["Mã NV", "Nhân sự", "Team", "Hoàn thành CV", "Teamwork"], ["NV001", "A", "Joe", "", ""], ["NV002", "B", "", "", ""]]);
check("Điểm '4,5' → 4.5", parseScoreCell("4,5"), 4.5);
check("Điểm 6 → invalid", parseScoreCell(6), "invalid");
check("Điểm âm → invalid", parseScoreCell(-1), "invalid");
check("Điểm chữ → invalid", parseScoreCell("giỏi"), "invalid");
check("Ô trống → null", parseScoreCell(""), null);
check("Điểm 0 hợp lệ (khác ô trống)", parseScoreCell(0), 0);
const sheetValues: unknown[][] = [
  ["Team", "TEAMWORK", "Mã NV", "Nhân sự", "Hoàn thành CV"],
  ["Joe", 4, "nv001", "A", 5],
  ["Joe", "", "NV002", "B", "3,5"],
  ["", "", "", "", ""],
  ["Joe", 9, "NV003", "C", 4],
];
const perf = parsePerfSheet(sheetValues, crit);
check("Đọc điểm theo tên cột, không phụ thuộc thứ tự", [...perf.rows[0].scores], [["c1", 5], ["c2", 4]]);
check("Ô trống = null (sẽ xóa điểm cũ), '3,5' = 3.5", [...perf.rows[1].scores], [["c1", 3.5], ["c2", null]]);
check("Dòng có điểm sai bị bỏ và báo lỗi rõ", [perf.rows.length, perf.errors[0].includes("Dòng 5 (NV003)") && perf.errors[0].includes("Teamwork")], [2, true]);
check("Tab thiếu cột tiêu chí thì báo, không lỗi", parsePerfSheet([["Mã NV", "Hoàn thành CV"], ["NV001", 4]], crit).missingCriteria, ["Teamwork"]);
check("Tab không có tiêu chí nào khớp bị báo", parsePerfSheet([["Mã NV", "Khác"], ["NV001", 4]], crit).errors.length, 1);
check("Tab sai định dạng bị báo", parsePerfSheet([["a"]], crit).errors.length, 1);
// ── Thứ tự nhân sự theo mã ở mọi file xuất ──
import { compareEmployeeCodes, sortByEmployeeCode } from "../src/lib/employee-order";
check("Sắp theo mã: ADM → NV001 → NV002 → NV010 → NV100 → NV1000", ["NV010", "nv001", "ADM", "NV1000", "NV002", "NV100"].sort(compareEmployeeCodes), ["ADM", "nv001", "NV002", "NV010", "NV100", "NV1000"]);
check("Không xếp theo tên alphabet", sortByEmployeeCode([{ code: "NV002", name: "An" }, { code: "NV001", name: "Zung" }, { code: "ADM", name: "Minh" }], (x) => x.code).map((x) => x.name), ["Minh", "Zung", "An"]);
check("Mã giống nhau giữ nguyên thứ tự", compareEmployeeCodes("NV001", "NV001"), 0);
console.log(failed ? `\n${failed} lỗi` : "\nTất cả đều đúng");
process.exit(failed ? 1 : 0);
