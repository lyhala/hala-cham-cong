// Quy tắc tính công + phạt đi muộn (spec §3.2, §3.3). Hàm thuần: không đụng DB để dễ kiểm tra.
// Cấu hình (ca, bảng phạt) truyền vào từ SETTING_DEFAULTS / bảng Setting.

import { TZ } from "@/lib/dates";
import type { SettingValue } from "@/lib/settings";

export type WorkSchedule = SettingValue<"workSchedule">;
export type LatePenaltyConfig = SettingValue<"latePenalty">;

/** "08:30" → 510 (phút tính từ 00:00). */
function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Số phút trong ngày (giờ VN) của 1 mốc thời gian, bỏ phần giây. */
function minuteOfDayVN(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  const m = Number(parts.find((p) => p.type === "minute")!.value);
  return h * 60 + m;
}

/** Ngày "YYYY-MM-DD" có phải ngày làm việc không: ngày ngoại lệ trong lịch được ưu tiên hơn T2–T6 mặc định. */
export function isWorkday(day: string, schedule: WorkSchedule, override?: { isWorkday: boolean } | null) {
  if (override) return override.isWorkday;
  const [y, m, d] = day.split("-").map(Number);
  return schedule.workWeekdays.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

/**
 * Phạt đi muộn lũy tiến: mỗi phút muộn tính theo mức của khung chứa phút đó (không lấy mức khung cuối cho cả buổi).
 * VD đến 08:50: 15 phút × 1.000 + 5 phút × 2.000 = 25.000đ. Đến sau `halfDayAfter` thì không phạt tiền mà trừ 1/2 công.
 */
export function calcLate(checkIn: Date, schedule: WorkSchedule, config: LatePenaltyConfig) {
  const arrival = minuteOfDayVN(checkIn);
  const shiftStart = toMinutes(schedule.morningStart);
  const lateMinutes = Math.max(0, arrival - shiftStart);

  if (arrival > toMinutes(config.halfDayAfter)) {
    return { lateMinutes, penalty: 0, halfDayDeducted: true };
  }

  let penalty = 0;
  for (const tier of config.tiers) {
    // Khung "08:31–08:45" gồm các phút muộn thứ 1..15 (mốc bắt đầu tính từ 08:30)
    const first = toMinutes(tier.from) - shiftStart;
    const last = toMinutes(tier.to) - shiftStart;
    const minutesInTier = Math.min(lateMinutes, last) - first + 1;
    if (minutesInTier > 0) penalty += minutesInTier * tier.perMinute;
  }
  return { lateMinutes, penalty, halfDayDeducted: false };
}

/** Các mốc trong ngày (phút từ 00:00) suy ra từ khung giờ cấu hình — đổi cấu hình ca là công thức đổi theo. */
export function scheduleTimes(schedule: WorkSchedule) {
  const ms = toMinutes(schedule.morningStart);
  const me = toMinutes(schedule.morningEnd);
  const as = toMinutes(schedule.afternoonStart);
  const ae = toMinutes(schedule.afternoonEnd);
  return { ms, me, as, ae, morningMin: me - ms, afternoonMin: ae - as, dayMin: me - ms + (ae - as) };
}

/** Số giờ của 1 ngày công chuẩn = tổng 2 buổi (VD 8h30–12h + 13h30–17h30 = 3,5 + 4 = 7,5 giờ). */
export function standardHoursPerDay(schedule: WorkSchedule) {
  return scheduleTimes(schedule).dayMin / 60;
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export type DayInput = {
  checkIn: Date | null;
  checkOut: Date | null;
  workday: boolean;
  exempt: boolean; // Cờ "miễn chấm công"
  lateExcused?: boolean; // Ngày này có đơn đi muộn được miễn (nằm trong 3 suất/tháng)
  leaveSession?: "MORNING" | "AFTERNOON" | null; // Buổi đã có đơn nghỉ / WFH nửa ngày được duyệt
};

export type DayResult = {
  workUnits: number;
  lateMinutes: number;
  latePenalty: number;
  halfDayDeducted: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Tính công 1 ngày, mọi mốc giờ lấy từ khung giờ cấu hình (buổi sáng, nghỉ trưa, buổi chiều).
 * - Ngày nghỉ (không phải ngày làm việc): 0 công. Miễn chấm công: đủ 1 công, bỏ qua dữ liệu Hanet.
 * - Công = giờ làm thực tế ÷ giờ của 1 ngày công chuẩn. Giờ làm thực tế = thời gian có mặt (từ giờ đến, nhưng không
 *   sớm hơn giờ vào ca, tới giờ về) TRỪ phần nằm trong giờ nghỉ trưa. Chỉ trừ khi thực sự nằm trong giờ nghỉ trưa:
 *   VD 11h30 → 17h30 = 6 giờ có mặt − 1,5 giờ nghỉ trưa = 4,5 giờ (không phải 6); 13h30 → 17h30 = 4 giờ (không trừ gì).
 * - Đến muộn thì làm bù buổi tối vẫn được cộng (giờ đến thực tế, không theo giờ ghi trong đơn xin đi muộn):
 *   đủ công khi ở lại tới giờ đến + giờ công chuẩn + nghỉ trưa. Tối đa 1 công/ngày.
 * - Ngày có đơn nghỉ / WFH NỬA NGÀY được duyệt: chỉ xét buổi còn lại (không phạt tiền đi muộn buổi đã nghỉ), công của buổi
 *   này = giờ làm thực tế ÷ giờ công chuẩn, tối đa 0,5; vào muộn thì vẫn bị trừ công. Cộng 0,5 công từ đơn nghỉ.
 * - Có checkin mà chưa có checkout: 0 công (chưa đủ dữ liệu; Admin sửa tay được).
 * - Đến sau 10h mà KHÔNG có đơn được miễn: trừ thêm 1/2 công vào công thực, không phạt tiền.
 *   Có đơn được miễn thì tính công bình thường theo giờ thực tế (VD đến 10h, về 17h30 = 6/7,5 công; muốn đủ công phải ở lại tới 19h).
 */
export function calcDay(input: DayInput, schedule: WorkSchedule, config: LatePenaltyConfig): DayResult {
  const none: DayResult = { workUnits: 0, lateMinutes: 0, latePenalty: 0, halfDayDeducted: false };
  if (!input.workday) return none;
  if (input.exempt) return { ...none, workUnits: 1 };
  if (!input.checkIn) return none;

  const t = scheduleTimes(schedule);
  const inMin = minuteOfDayVN(input.checkIn);
  // Nghỉ sáng thì mốc đến chuẩn là đầu buổi chiều và không áp bảng phạt (bảng phạt chỉ dành cho giờ vào ca buổi sáng)
  const late =
    input.leaveSession === "MORNING"
      ? { lateMinutes: Math.max(0, inMin - t.as), penalty: 0, halfDayDeducted: false }
      : calcLate(input.checkIn, schedule, config);
  const halfDayDeducted = late.halfDayDeducted && !input.lateExcused;
  const base = { lateMinutes: late.lateMinutes, latePenalty: late.penalty, halfDayDeducted };
  if (!input.checkOut) return { ...base, workUnits: 0 };

  const outMin = minuteOfDayVN(input.checkOut);
  let units: number;
  if (input.leaveSession) {
    // Giờ làm thực tế trong buổi còn lại ÷ giờ công chuẩn (vào muộn buổi này thì bị trừ công), tối đa 0,5 vì 0,5 còn lại là công từ đơn nghỉ
    const [from, to] = input.leaveSession === "MORNING" ? [t.as, t.ae] : [t.ms, t.me];
    units = Math.min(0.5, overlap(inMin, outMin, from, to) / t.dayMin);
  } else {
    const start = Math.max(inMin, t.ms); // đến sớm hơn giờ vào ca thì lấy giờ vào ca làm mốc
    const present = Math.max(0, outMin - start);
    const workedMin = Math.max(0, present - overlap(start, outMin, t.me, t.as));
    units = Math.min(t.dayMin, workedMin) / t.dayMin;
  }
  if (halfDayDeducted) units = Math.max(0, units - 0.5);
  return { ...base, workUnits: round2(units) };
}
export type LateRequestRef = { dateFrom: Date; employeeId: string };

/**
 * Chọn các ngày đi muộn được miễn phạt trong tháng (§3.3): trong các đơn ĐI MUỘN đã duyệt (chưa bị xóa),
 * lấy `free` đơn có ngày đi muộn SỚM NHẤT — không theo thứ tự gửi/duyệt. Đơn thứ 4 trở đi vẫn bị phạt.
 * Trả về tập ngày "YYYY-MM-DD" được miễn; Admin xóa 1 đơn thì gọi lại hàm này là suất tự dồn sang đơn sau.
 */
export function pickExemptDays(approvedLateDays: string[], free: number) {
  return new Set([...new Set(approvedLateDays)].sort().slice(0, free));
}

/** Tổng phạt cả tháng sau khi trừ các ngày được miễn. `days`: mỗi ngày có tiền phạt trước miễn phạt. */
export function monthlyLatePenalty(days: { day: string; latePenalty: number }[], exemptDays: Set<string>) {
  return days.reduce((sum, d) => (exemptDays.has(d.day) ? sum : sum + d.latePenalty), 0);
}
