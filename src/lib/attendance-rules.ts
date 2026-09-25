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
 * VD đến 08:50: 15 phút × 1.000 + 5 phút × 2.000 = 25.000đ. Đến quá `halfDayAfter` thì không phạt tiền mà trừ 1/2 công.
 * Các khung phạt và mốc trừ ½ công được đặt theo giờ của ca mặc định; ngày có giờ vào ca khác (VD thứ 7 vào 8h00) thì
 * tính theo SỐ PHÚT MUỘN so với giờ vào ca của ngày đó (`dayStart`, phút từ 00:00) — cùng số phút muộn thì cùng mức phạt.
 */
export function calcLate(checkIn: Date, schedule: WorkSchedule, config: LatePenaltyConfig, dayStart?: number) {
  const arrival = minuteOfDayVN(checkIn);
  const defaultStart = toMinutes(schedule.morningStart);
  const lateMinutes = Math.max(0, arrival - (dayStart ?? defaultStart));

  if (lateMinutes > toMinutes(config.halfDayAfter) - defaultStart) {
    return { lateMinutes, penalty: 0, halfDayDeducted: true };
  }

  let penalty = 0;
  for (const tier of config.tiers) {
    // Khung "08:31–08:45" gồm các phút muộn thứ 1..15 (mốc bắt đầu tính từ giờ vào ca mặc định 08:30)
    const first = toMinutes(tier.from) - defaultStart;
    const last = toMinutes(tier.to) - defaultStart;
    const minutesInTier = Math.min(lateMinutes, last) - first + 1;
    if (minutesInTier > 0) penalty += minutesInTier * tier.perMinute;
  }
  return { lateMinutes, penalty, halfDayDeducted: false };
}

/** Các mốc trong ngày (phút từ 00:00) của ca MẶC ĐỊNH suy ra từ khung giờ cấu hình — đổi cấu hình ca là công thức đổi theo. */
export function scheduleTimes(schedule: WorkSchedule) {
  const ms = toMinutes(schedule.morningStart);
  const me = toMinutes(schedule.morningEnd);
  const as = toMinutes(schedule.afternoonStart);
  const ae = toMinutes(schedule.afternoonEnd);
  return { ms, me, as, ae, morningMin: me - ms, afternoonMin: ae - as, dayMin: me - ms + (ae - as) };
}

/** Số giờ của 1 ngày công chuẩn (ca mặc định) = tổng 2 buổi (VD 8h30–12h + 13h30–17h30 = 3,5 + 4 = 7,5 giờ). */
export function standardHoursPerDay(schedule: WorkSchedule) {
  return scheduleTimes(schedule).dayMin / 60;
}

export type DaySchedule = {
  weekday: number; // 0 = Chủ nhật
  morning: [number, number] | null; // [giờ vào, giờ ra] buổi sáng (phút từ 00:00), null = không làm buổi sáng
  afternoon: [number, number] | null;
  start: number; // Giờ vào ca sớm nhất trong ngày
  dayMin: number; // Tổng số phút làm việc chuẩn của ngày
  gap: [number, number] | null; // Khoảng nghỉ giữa 2 buổi (nghỉ trưa), null nếu ngày chỉ có 1 buổi
  unit: number; // Số công khi đi làm đủ giờ (ngày thường = 1; thứ 7 chỉ làm sáng thường = 0,5)
  custom: boolean; // Có giờ làm riêng theo thứ hay dùng giờ mặc định
};

const round05 = (n: number) => Math.round(n * 2) / 2;

/**
 * Giờ làm việc của 1 ngày cụ thể: thứ nào có giờ riêng trong `schedule.daySchedules` thì dùng, còn lại dùng giờ mặc định.
 * Số công của ngày làm nửa buổi: nếu không đặt riêng thì tự tính theo tỷ lệ giờ so với ngày thường, làm tròn 0,5 (3,5h/7,5h ≈ 0,5).
 */
export function scheduleForDay(schedule: WorkSchedule, day: string): DaySchedule {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const base = scheduleTimes(schedule);
  const fallback: DaySchedule = { weekday, morning: [base.ms, base.me], afternoon: [base.as, base.ae], start: base.ms, dayMin: base.dayMin, gap: [base.me, base.as], unit: 1, custom: false };

  const custom = schedule.daySchedules?.[String(weekday)];
  if (!custom) return fallback;
  const pair = (a: string | null, b: string | null): [number, number] | null => (a && b ? [toMinutes(a), toMinutes(b)] : null);
  const morning = pair(custom.morningStart, custom.morningEnd);
  const afternoon = pair(custom.afternoonStart, custom.afternoonEnd);
  const dayMin = (morning ? morning[1] - morning[0] : 0) + (afternoon ? afternoon[1] - afternoon[0] : 0);
  if (dayMin <= 0) return fallback; // cấu hình hỏng (không có buổi nào) → dùng giờ mặc định
  return {
    weekday,
    morning,
    afternoon,
    start: morning ? morning[0] : afternoon![0],
    dayMin,
    gap: morning && afternoon ? [morning[1], afternoon[0]] : null,
    unit: custom.unit ?? Math.min(1, Math.max(0.5, round05(dayMin / base.dayMin))),
    custom: true,
  };
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export type DayInput = {
  day: string; // "YYYY-MM-DD" — để lấy giờ làm của đúng thứ trong tuần
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
 * Tính công 1 ngày, mọi mốc giờ lấy từ khung giờ cấu hình của ĐÚNG THỨ trong tuần (buổi sáng, nghỉ giữa buổi, buổi chiều).
 * - Ngày nghỉ (không phải ngày làm việc): 0 công. Miễn chấm công: được đủ công của ngày, bỏ qua dữ liệu Hanet.
 * - Công = (giờ làm thực tế ÷ giờ chuẩn của ngày) × số công của ngày đó (ngày thường 1; thứ 7 chỉ làm sáng thường 0,5).
 *   Giờ làm thực tế = thời gian có mặt (từ giờ đến, không sớm hơn giờ vào ca, tới giờ về) TRỪ phần nằm trong giờ nghỉ giữa 2 buổi.
 *   Chỉ trừ khi thực sự nằm trong giờ nghỉ: VD 11h30 → 17h30 = 6 giờ có mặt − 1,5 giờ nghỉ trưa = 4,5 giờ; 13h30 → 17h30 = 4 giờ.
 * - Đến muộn thì làm bù buổi tối vẫn được cộng (giờ đến thực tế, không theo giờ ghi trong đơn xin đi muộn).
 *   Tối đa đủ công của ngày.
 * - Ngày có đơn nghỉ / WFH NỬA NGÀY được duyệt: chỉ xét buổi còn lại (không phạt tiền đi muộn buổi đã nghỉ), công của buổi
 *   này = giờ làm thực tế ÷ giờ chuẩn của ngày, tối đa nửa công của ngày; vào muộn thì vẫn bị trừ công. Cộng công từ đơn nghỉ.
 *   Ngày chỉ có 1 buổi mà nghỉ đúng buổi đó = nghỉ cả ngày.
 * - Có checkin mà chưa có checkout: 0 công (chưa đủ dữ liệu; Admin sửa tay được).
 * - Đến sau mốc trừ ½ công (mặc định 10h) mà KHÔNG có đơn được miễn: trừ thêm 1/2 công của ngày, không phạt tiền.
 *   Có đơn được miễn thì tính công bình thường theo giờ thực tế (VD đến 10h, về 17h30 = 6/7,5 công; muốn đủ công phải ở lại tới 19h).
 */
export function calcDay(input: DayInput, schedule: WorkSchedule, config: LatePenaltyConfig): DayResult {
  const none: DayResult = { workUnits: 0, lateMinutes: 0, latePenalty: 0, halfDayDeducted: false };
  if (!input.workday) return none;
  const t = scheduleForDay(schedule, input.day);
  if (input.exempt) return { ...none, workUnits: t.unit };
  if (!input.checkIn) return none;

  // Đơn nghỉ nửa ngày chỉ có tác dụng nếu ngày đó thực sự có buổi bị nghỉ
  const leaveSession = input.leaveSession === "MORNING" ? (t.morning ? "MORNING" : null) : input.leaveSession === "AFTERNOON" ? (t.afternoon ? "AFTERNOON" : null) : null;
  const remaining = leaveSession === "MORNING" ? t.afternoon : leaveSession === "AFTERNOON" ? t.morning : null;
  if (leaveSession && !remaining) return none; // ngày chỉ có 1 buổi mà nghỉ buổi đó = nghỉ cả ngày

  const inMin = minuteOfDayVN(input.checkIn);
  // Nghỉ sáng thì mốc đến chuẩn là đầu buổi chiều và không áp bảng phạt (bảng phạt chỉ dành cho giờ vào ca buổi sáng)
  const late =
    leaveSession === "MORNING"
      ? { lateMinutes: Math.max(0, inMin - remaining![0]), penalty: 0, halfDayDeducted: false }
      : calcLate(input.checkIn, schedule, config, t.start);
  const halfDayDeducted = late.halfDayDeducted && !input.lateExcused;
  const base = { lateMinutes: late.lateMinutes, latePenalty: late.penalty, halfDayDeducted };
  if (!input.checkOut) return { ...base, workUnits: 0 };

  const outMin = minuteOfDayVN(input.checkOut);
  let units: number;
  if (leaveSession) {
    // Giờ làm thực tế trong buổi còn lại ÷ giờ chuẩn của ngày (vào muộn buổi này thì bị trừ công), tối đa nửa công của ngày
    units = Math.min(0.5 * t.unit, (overlap(inMin, outMin, remaining![0], remaining![1]) / t.dayMin) * t.unit);
  } else {
    const start = Math.max(inMin, t.start); // đến sớm hơn giờ vào ca thì lấy giờ vào ca làm mốc
    const present = Math.max(0, outMin - start);
    const workedMin = Math.max(0, present - (t.gap ? overlap(start, outMin, t.gap[0], t.gap[1]) : 0));
    units = (Math.min(t.dayMin, workedMin) / t.dayMin) * t.unit;
  }
  if (halfDayDeducted) units = Math.max(0, units - 0.5 * t.unit);
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
