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

// ── Phép năm (§4): 1 ngày/tháng cho nhân sự chính thức, cộng dồn, không nghỉ ứng trước, tồn cuối năm quy đổi ra lương ──
import { accrualUptoMonth, annualLeaveAccrued, annualLeaveShortage, leaveDaysToPayOut, leaveEligibleFrom, leavePayoutAmount } from "../src/lib/leave-policy";
import { SETTING_DEFAULTS } from "../src/lib/settings";
const policy = SETTING_DEFAULTS.leavePolicy;
const acc = (eligibleFrom: string, uptoMonth: number, p = policy) => annualLeaveAccrued({ year: 2026, uptoMonth, eligibleFrom, policy: p });

check("Mặc định: 1 ngày phép/tháng, thử việc 2 tháng", [policy.daysPerMonth, policy.probationMonths], [1, 2]);
check("Vào làm 10/11/2025 (thử việc xong từ 2026) → tích lũy từ 01/2026", leaveEligibleFrom("2025-11-10", null, policy), "2026-01");
check("Vào 15/03/2026, thử việc mặc định 2 tháng → từ tháng thứ 3 (05/2026)", leaveEligibleFrom("2026-03-15", null, policy), "2026-05");
check("Thử việc 1 tháng → từ 04/2026", leaveEligibleFrom("2026-03-15", 1, policy), "2026-04");
check("Thử việc 3 tháng → từ 06/2026", leaveEligibleFrom("2026-03-15", 3, policy), "2026-06");
check("Bỏ qua thử việc (0 tháng) → tích lũy từ tháng vào làm", leaveEligibleFrom("2026-03-15", 0, policy), "2026-03");
check("Vào cuối tháng cũng như đầu tháng (tính theo tháng)", leaveEligibleFrom("2026-03-31", null, policy), "2026-05");
check("Chưa có ngày vào làm → coi như nhân sự lâu năm", leaveEligibleFrom(null, null, policy), "0000-01");

check("Làm từ đầu năm: đến hết tháng 9 tích lũy 9 ngày", acc("2026-01", 9), 9);
check("Cuối năm tích lũy đủ 12 ngày", acc("2026-01", 12), 12);
check("Chính thức từ 05/2026: đến hết tháng 9 có 5 ngày (cộng dồn)", acc("2026-05", 9), 5);
check("Chính thức từ 05/2026: đến hết tháng 3 chưa có ngày nào", acc("2026-05", 3), 0);
check("Bỏ qua thử việc vào 03/2026: cả năm 10 ngày", acc("2026-03", 12), 10);
check("Cấu hình 1,5 ngày/tháng: 4 tháng = 6 ngày", acc("2026-01", 4, { ...policy, daysPerMonth: 1.5 }), 6);
check("Năm nay tính đến tháng hiện tại (9)", accrualUptoMonth(2026, "2026-09"), 9);
check("Năm cũ đã đủ 12 tháng", accrualUptoMonth(2025, "2026-09"), 12);
check("Năm sau chưa tích lũy", accrualUptoMonth(2027, "2026-09"), 0);

const sh = (over: Partial<Parameters<typeof annualLeaveShortage>[0]>) => annualLeaveShortage({ year: 2026, accrued: 9, used: 0, needed: 1, eligibleFrom: "2026-01", leaveFromMonth: "2026-09", uptoMonth: 9, ...over });
check("Còn phép → cho nghỉ", sh({ used: 8, needed: 1 }), null);
check("Không dùng thì cộng dồn: nghỉ 9 ngày liền khi đã tích lũy 9 → cho phép", sh({ needed: 9 }), null);
check("Nghỉ 2 ngày khi chỉ còn 1 → báo còn 1 ngày", sh({ used: 8, needed: 2 })?.includes("còn 1 ngày"), true);
check("Báo rõ không được nghỉ ứng trước", sh({ used: 9, needed: 1 })?.includes("ứng trước"), true);
check("Nghỉ ứng trước phép tháng sau bị chặn (mới tích lũy 9)", sh({ needed: 10 }) !== null, true);
check("Ngày nghỉ trong thời gian thử việc → chặn", sh({ eligibleFrom: "2026-05", leaveFromMonth: "2026-04", accrued: 5 })?.includes("thử việc"), true);
check("Vừa hết thử việc (05/2026) nghỉ 1 ngày → được", sh({ eligibleFrom: "2026-05", leaveFromMonth: "2026-05", accrued: 1, uptoMonth: 5 }), null);

check("Phép tồn quy đổi = đã tích lũy 12 − đã nghỉ 7 = 5 ngày", leaveDaysToPayOut(12, 7), 5);
check("Nghỉ hết phép → không có gì để quy đổi", leaveDaysToPayOut(3, 3), 0);
check("Phép tồn không âm", leaveDaysToPayOut(3, 5), 0);
check("Tiền quy đổi 5 ngày = lương base 10tr ÷ 22 ngày công × 5", leavePayoutAmount(10_000_000, 22, 5), 2_272_727);
check("Ngày công tháng = 0 → không chia cho 0", leavePayoutAmount(10_000_000, 0, 5), 0);
console.log(failed ? `\n${failed} lỗi` : "\nTất cả đều đúng");
process.exit(failed ? 1 : 0);
