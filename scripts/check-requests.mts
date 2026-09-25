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

console.log(failed ? `\n${failed} lỗi` : "\nTất cả đều đúng");
process.exit(failed ? 1 : 0);
