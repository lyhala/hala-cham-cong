// Kiểm tra quy tắc đơn từ (spec §5, §4, §3.3) — không cần database. Chạy: npm run check:requests

import { daysInRange, hoursBetween, leaveUnitsInMonth, lateExemptionWarning, nextStatusOnApprove, otDayKind, validateRequest, type RequestInput } from "../src/lib/requests";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok ? "" : ` — mong đợi ${JSON.stringify(want)}, nhận ${JSON.stringify(got)}`}`);
}

const base: RequestInput = { type: "LATE", leaveSubtype: null, dateFrom: "2026-09-10", dateTo: null, dayPortion: null, timeFrom: "08:30", timeTo: "09:30", amount: null, reason: "Kẹt xe" };
const v = (over: Partial<RequestInput>) => validateRequest({ ...base, ...over });

// Kiểm tra theo loại đơn
check("Đơn đi muộn hợp lệ", v({}), null);
check("Thiếu lý do", v({ reason: "  " })?.includes("lý do"), true);
check("Đi muộn thiếu khung giờ", v({ timeFrom: null })?.includes("khung giờ"), true);
check("Giờ đến trước giờ bắt đầu", v({ timeFrom: "09:00", timeTo: "08:00" })?.includes("sau giờ bắt đầu"), true);
check("OT qua nửa đêm 22h → 02h hợp lệ", v({ type: "OT", timeFrom: "22:00", timeTo: "02:00" }), null);
check("OT quá 12 giờ bị chặn", v({ type: "OT", timeFrom: "06:00", timeTo: "20:00" })?.includes("12 giờ"), true);
check("Nghỉ thiếu loại nghỉ", v({ type: "LEAVE", dateFrom: "2026-09-10", dateTo: "2026-09-11" })?.includes("loại nghỉ"), true);
check("Nghỉ phép hợp lệ", v({ type: "LEAVE", leaveSubtype: "ANNUAL", dateFrom: "2026-09-10", dateTo: "2026-09-11", dayPortion: "FULL" }), null);
check("Ngày kết thúc trước ngày bắt đầu", v({ type: "WFH", dateFrom: "2026-09-11", dateTo: "2026-09-10" })?.includes("Ngày kết thúc"), true);
check("Nửa ngày cho đơn nhiều ngày bị chặn", v({ type: "WFH", dateFrom: "2026-09-10", dateTo: "2026-09-11", dayPortion: "MORNING" })?.includes("1 ngày"), true);
check("Nửa ngày cho đơn 1 ngày hợp lệ", v({ type: "WFH", dateFrom: "2026-09-10", dateTo: "2026-09-10", dayPortion: "MORNING" }), null);
check("Tạm ứng cần số tiền", v({ type: "SALARY_ADVANCE", amount: null })?.includes("số tiền"), true);
check("Tạm ứng hợp lệ (không cần ngày/giờ)", v({ type: "SALARY_ADVANCE", amount: 2_000_000, dateFrom: null, timeFrom: null, timeTo: null }), null);

// Giờ, ngày
check("8h30 → 9h30 = 1 giờ", hoursBetween("08:30", "09:30"), 1);
check("22:00 → 02:00 = 4 giờ", hoursBetween("22:00", "02:00"), 4);
check("18:00 → 20:30 = 2,5 giờ", hoursBetween("18:00", "20:30"), 2.5);
check("Dải ngày gồm 2 đầu", daysInRange("2026-09-29", "2026-10-02"), ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);

// Nghỉ trong tháng: chỉ đếm ngày làm việc trong tháng đó
const weekday = (d: string) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
check("Nghỉ T2–T6 (7–11/9) = 5 ngày", leaveUnitsInMonth({ dateFrom: "2026-09-07", dateTo: "2026-09-11", dayPortion: "FULL" }, "2026-09", weekday), 5);
check("Nghỉ qua cuối tuần chỉ đếm ngày làm", leaveUnitsInMonth({ dateFrom: "2026-09-11", dateTo: "2026-09-14", dayPortion: "FULL" }, "2026-09", weekday), 2);
check("Nghỉ qua tháng: chỉ tính phần trong tháng 9", leaveUnitsInMonth({ dateFrom: "2026-09-29", dateTo: "2026-10-02", dayPortion: "FULL" }, "2026-09", weekday), 2);
check("Nghỉ nửa ngày = 0,5", leaveUnitsInMonth({ dateFrom: "2026-09-10", dateTo: "2026-09-10", dayPortion: "MORNING" }, "2026-09", weekday), 0.5);
check("Ngày lễ trong lịch không tính công nghỉ", leaveUnitsInMonth({ dateFrom: "2026-09-01", dateTo: "2026-09-03", dayPortion: "FULL" }, "2026-09", (d) => weekday(d) && d !== "2026-09-02"), 2);

// Loại ngày OT
check("Ngày lễ → 3x", otDayKind({ isHoliday: true, workday: false }), "holiday");
check("Ngày nghỉ → 2x", otDayKind({ isHoliday: false, workday: false }), "weekend");
check("Ngày thường → 1.5x", otDayKind({ isHoliday: false, workday: true }), "weekday");

// Duyệt 1 cấp / 2 cấp
check("1 cấp: Leader duyệt = xong", nextStatusOnApprove(1, "PENDING", "LEADER"), "APPROVED");
check("1 cấp: Admin duyệt = xong", nextStatusOnApprove(1, "PENDING", "ADMIN"), "APPROVED");
check("2 cấp: Leader duyệt → chờ Admin", nextStatusOnApprove(2, "PENDING", "LEADER"), "LEADER_APPROVED");
check("2 cấp: Admin duyệt thẳng = xong", nextStatusOnApprove(2, "PENDING", "ADMIN"), "APPROVED");
check("2 cấp: Admin duyệt sau Leader = xong", nextStatusOnApprove(2, "LEADER_APPROVED", "ADMIN"), "APPROVED");
check("2 cấp: Leader không duyệt lại lần 2", nextStatusOnApprove(2, "LEADER_APPROVED", "LEADER"), null);
check("Đơn đã duyệt không duyệt lại", nextStatusOnApprove(1, "APPROVED", "ADMIN"), null);
check("Đơn từ chối không duyệt được", nextStatusOnApprove(1, "REJECTED", "ADMIN"), null);

// Cảnh báo vượt 3 lần miễn phạt
check("Đơn thứ 4 có ngày muộn nhất → cảnh báo", lateExemptionWarning("2026-09-20", ["2026-09-01", "2026-09-02", "2026-09-03"], 3) !== null, true);
check("Đơn thứ 4 nhưng ngày sớm nhất → không cảnh báo (được xếp vào 3 đơn đầu)", lateExemptionWarning("2026-09-01", ["2026-09-05", "2026-09-06", "2026-09-07"], 3), null);
check("Mới 2 đơn → không cảnh báo", lateExemptionWarning("2026-09-20", ["2026-09-01", "2026-09-02"], 3), null);

// ── Phép năm (§4): đủ 12 ngày nếu làm từ đầu năm; nhân sự mới qua thử việc 2 tháng mới tính phép ──
import { annualLeaveEntitlement, annualLeaveShortage, leaveEligibleFrom } from "../src/lib/leave-policy";
import { SETTING_DEFAULTS } from "../src/lib/settings";
const policy = SETTING_DEFAULTS.leavePolicy;

check("Vào làm 10/11/2025 → được tính phép từ 01/2026", leaveEligibleFrom("2025-11-10", false, policy), "2026-01");
check("Vào làm 15/03/2026: tháng 3, 4 thử việc → từ tháng thứ 3 (05/2026) mới tính phép", leaveEligibleFrom("2026-03-15", false, policy), "2026-05");
check("Vào làm 31/03/2026 cũng như vậy (tính theo tháng)", leaveEligibleFrom("2026-03-31", false, policy), "2026-05");
check("Bỏ qua thử việc → tính từ tháng vào làm", leaveEligibleFrom("2026-03-15", true, policy), "2026-03");
check("Chưa có ngày vào làm → coi như nhân sự lâu năm", annualLeaveEntitlement(2026, leaveEligibleFrom(null, false, policy), policy), 12);
check("Làm từ đầu năm (đã qua thử việc) → đủ 12 phép", annualLeaveEntitlement(2026, "2026-01", policy), 12);
check("Nhân sự cũ vào từ năm trước → đủ 12 phép", annualLeaveEntitlement(2026, leaveEligibleFrom("2024-05-01", false, policy), policy), 12);
check("Vào 15/03/2026: chỉ tính phép 05→12 = 8 ngày", annualLeaveEntitlement(2026, "2026-05", policy), 8);
check("Vào 15/03/2026 bỏ qua thử việc: 03→12 = 10 ngày", annualLeaveEntitlement(2026, "2026-03", policy), 10);
check("Vào 20/11/2026: hết năm vẫn thử việc → 0 phép năm 2026", annualLeaveEntitlement(2026, leaveEligibleFrom("2026-11-20", false, policy), policy), 0);
check("… nhưng năm 2027 đã có phép", annualLeaveEntitlement(2027, "2027-01", policy), 12);

check("Còn đủ phép → cho nghỉ", annualLeaveShortage({ year: 2026, entitlement: 12, used: 10, needed: 2, eligibleFrom: "2026-01" }), null);
check("Nghỉ 3 ngày khi còn 2 → báo thiếu phép", annualLeaveShortage({ year: 2026, entitlement: 12, used: 10, needed: 3, eligibleFrom: "2026-01" })?.includes("còn 2 ngày"), true);
check("Đang thử việc → báo chưa có phép, gợi ý nghỉ không lương", annualLeaveShortage({ year: 2026, entitlement: 0, used: 0, needed: 1, eligibleFrom: "2027-01" })?.includes("thử việc"), true);
check("Xin nghỉ phép ngày 20/04 khi thử việc đến hết 04 (được tính phép từ 05) → chặn", annualLeaveShortage({ year: 2026, entitlement: 8, used: 0, needed: 1, eligibleFrom: "2026-05", leaveFromMonth: "2026-04" })?.includes("thử việc"), true);
check("Xin nghỉ phép ngày 05/05 (đã hết thử việc) → cho phép", annualLeaveShortage({ year: 2026, entitlement: 8, used: 0, needed: 1, eligibleFrom: "2026-05", leaveFromMonth: "2026-05" }), null);
check("Cấu hình thử việc 3 tháng → từ tháng thứ 4", leaveEligibleFrom("2026-03-15", false, { ...policy, probationMonths: 3 }), "2026-06");
check("Cấu hình 15 ngày/năm → đủ 15", annualLeaveEntitlement(2026, "2026-01", { ...policy, daysPerYear: 15 }), 15);
console.log(failed ? `\n${failed} lỗi` : "\nTất cả đều đúng");
process.exit(failed ? 1 : 0);
