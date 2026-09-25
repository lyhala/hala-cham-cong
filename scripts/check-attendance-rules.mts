// Kiểm tra quy tắc tính công + phạt đi muộn (spec §3.2, §3.3) — KHÔNG cần database hay server.
// Chạy: npm run check:rules

import { calcDay, calcLate, monthlyLatePenalty, pickExemptDays, standardHoursPerDay } from "../src/lib/attendance-rules";
import { SETTING_DEFAULTS } from "../src/lib/settings";

const schedule = SETTING_DEFAULTS.workSchedule;
const config = SETTING_DEFAULTS.latePenalty;
const at = (hm: string) => new Date(`2026-09-24T${hm}:00+07:00`);

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok ? "" : `\n     mong đợi ${JSON.stringify(want)}\n     nhận được ${JSON.stringify(got)}`}`);
}

const day = (checkIn: string | null, checkOut: string | null, extra: object = {}) =>
  calcDay({ checkIn: checkIn ? at(checkIn) : null, checkOut: checkOut ? at(checkOut) : null, workday: true, exempt: false, ...extra }, schedule, config);

// Phạt lũy tiến (§3.3)
check("08:30 đúng giờ — không phạt", calcLate(at("08:30"), schedule, config), { lateMinutes: 0, penalty: 0, halfDayDeducted: false });
check("08:31 — 1 phút × 1.000", calcLate(at("08:31"), schedule, config).penalty, 1000);
check("08:45 — 15 phút × 1.000", calcLate(at("08:45"), schedule, config).penalty, 15000);
check("08:50 — 15×1.000 + 5×2.000", calcLate(at("08:50"), schedule, config).penalty, 25000);
check("09:00 — 15×1.000 + 15×2.000", calcLate(at("09:00"), schedule, config).penalty, 45000);
check("09:30 — + 30×3.000", calcLate(at("09:30"), schedule, config).penalty, 135000);
check("10:00 — + 30×5.000 (khung cuối)", calcLate(at("10:00"), schedule, config).penalty, 285000);
check("10:01 — không phạt tiền, trừ nửa công", calcLate(at("10:01"), schedule, config), { lateMinutes: 91, penalty: 0, halfDayDeducted: true });

// Tính công (§3.2): đủ công khi ở lại đủ 7,5h làm + 1,5h nghỉ trưa tính từ giờ đến THỰC TẾ
check("8:30 → 17:30 = 1 công", day("08:30", "17:30").workUnits, 1);
check("Đến sớm 8:00 → 17:30 vẫn 1 công (lấy mốc 8:30)", day("08:00", "17:30").workUnits, 1);
check("8:45 → 17:30 thiếu 15 phút = 0,97", day("08:45", "17:30").workUnits, 0.97);
check("8:45 → 17:45 = 1 công (đủ theo giờ đến thực tế)", day("08:45", "17:45").workUnits, 1);
check("Chưa check-out = 0 công", day("08:30", null).workUnits, 0);
check("Không có dữ liệu = 0 công", day(null, null).workUnits, 0);
check("Miễn chấm công = 1 công", day(null, null, { exempt: true }).workUnits, 1);
check("Ngày nghỉ = 0 công", day("08:30", "17:30", { workday: false }).workUnits, 0);

// Sau 10h (§3.3): không có đơn → trừ 0,5; có đơn được miễn → công theo giờ thực tế
check("10:00 có đơn, về 17:30 = 6/7,5 = 0,8", day("10:00", "17:30", { lateExcused: true }).workUnits, 0.8);
check("10:01 có đơn, về 19:01 = 1 công", day("10:01", "19:01", { lateExcused: true }).workUnits, 1);
check("10:01 không đơn, về 17:30 = 0,8 − 0,5 = 0,3", day("10:01", "17:30").workUnits, 0.3);

// 3 suất miễn phạt/tháng: lấy 3 ngày đi muộn SỚM NHẤT trong các đơn đã duyệt
check("Miễn 3 ngày sớm nhất", [...pickExemptDays(["2026-09-10", "2026-09-02", "2026-09-05", "2026-09-01"], 3)], ["2026-09-01", "2026-09-02", "2026-09-05"]);
check("Phạt tháng trừ ngày được miễn", monthlyLatePenalty([{ day: "2026-09-01", latePenalty: 5000 }, { day: "2026-09-10", latePenalty: 7000 }], new Set(["2026-09-01"])), 7000);

// ── Công tính theo giờ có mặt thực tế trong khung giờ cấu hình; nghỉ trưa chỉ trừ khi nằm trong đó ──
check("11:30 → 17:30 (có mặt 6h − nghỉ trưa 1,5h = 4,5h) = 0,6 công", day("11:30", "17:30", { lateExcused: true }).workUnits, 0.6);
check("12:30 → 17:30 (trừ 1h nghỉ trưa còn lại) = 4h = 0,53 công", day("12:30", "17:30", { lateExcused: true }).workUnits, 0.53);
check("13:30 → 17:30 (không nằm trong nghỉ trưa, không trừ) = 4h = 0,53 công", day("13:30", "17:30", { lateExcused: true }).workUnits, 0.53);
check("8:30 → 13:00 (trừ 1h nghỉ trưa) = 3,5h = 0,47 công", day("08:30", "13:00").workUnits, 0.47);
check("8:30 → 12:00 = 3,5h = 0,47 công", day("08:30", "12:00").workUnits, 0.47);
check("Quét trọn trong giờ nghỉ trưa = 0 công", day("12:10", "12:50", { lateExcused: true }).workUnits, 0);
check("Về 19:00 sau khi đến 8:30 vẫn tối đa 1 công", day("08:30", "19:00").workUnits, 1);

// Nghỉ nửa ngày: chỉ xét buổi còn lại, không phạt muộn buổi đã nghỉ, đủ buổi = 0,5 công
const morningLeave = day("13:30", "17:30", { leaveSession: "MORNING" });
check("Nghỉ sáng, đi làm đủ buổi chiều = 0,5 công, không phạt", [morningLeave.workUnits, morningLeave.latePenalty, morningLeave.halfDayDeducted], [0.5, 0, false]);
const lateAfternoon = day("14:00", "17:30", { leaveSession: "MORNING" });
check("Nghỉ sáng, vào chiều muộn 30' = 3,5h/7,5 = 0,47 (bị trừ công) nhưng không phạt tiền", [lateAfternoon.workUnits, lateAfternoon.lateMinutes, lateAfternoon.latePenalty], [0.47, 30, 0]);
check("Nghỉ chiều, đi làm đủ buổi sáng = 3,5h/7,5 = 0,47 công", day("08:30", "12:00", { leaveSession: "AFTERNOON" }).workUnits, 0.47);
check("Nghỉ sáng, đi làm đủ buổi chiều: 4h/7,5 vượt 0,5 nên chốt 0,5 (cộng 0,5 từ đơn nghỉ = 1 công)", day("13:30", "17:30", { leaveSession: "MORNING" }).workUnits, 0.5);
check("Nghỉ chiều, đến muộn 8:50 vẫn bị phạt bình thường", day("08:50", "12:00", { leaveSession: "AFTERNOON" }).latePenalty, 25000);

// Đổi cấu hình giờ làm: 8h–12h + 13h–17h (8 giờ/ngày) → mọi công thức đổi theo
const long: typeof schedule = { ...schedule, morningStart: "08:00", morningEnd: "12:00", afternoonStart: "13:00", afternoonEnd: "17:00" };
const dayLong = (a: string, b: string) => calcDay({ checkIn: at(a), checkOut: at(b), workday: true, exempt: false, lateExcused: true }, long, config).workUnits;
check("Cấu hình 8h/ngày: 1 ngày công chuẩn = 8 giờ", standardHoursPerDay(long), 8);
check("Cấu hình mới: 8:00 → 17:00 = 1 công", dayLong("08:00", "17:00"), 1);
check("Cấu hình mới: 8:00 → 16:00 = 7h/8h = 0,88", dayLong("08:00", "16:00"), 0.88);
check("Cấu hình mới: 11:00 → 17:00 = (6h − 1h nghỉ trưa)/8 = 0,63", dayLong("11:00", "17:00"), 0.63);
check("Cấu hình mặc định: 1 ngày công chuẩn = 7,5 giờ", standardHoursPerDay(schedule), 7.5);
console.log(failed ? `\n${failed} lỗi` : "\nTất cả đều đúng");
process.exit(failed ? 1 : 0);
