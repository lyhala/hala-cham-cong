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

export type DayInput = {
  checkIn: Date | null;
  checkOut: Date | null;
  workday: boolean;
  exempt: boolean; // Cờ "miễn chấm công"
  lateExcused?: boolean; // Ngày này có đơn đi muộn được miễn (nằm trong 3 suất/tháng)
};

export type DayResult = {
  workUnits: number;
  lateMinutes: number;
  latePenalty: number;
  halfDayDeducted: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Tính công 1 ngày.
 * - Ngày nghỉ (không phải ngày làm việc): 0 công. Miễn chấm công: đủ 1 công, bỏ qua dữ liệu Hanet.
 * - Đủ công khi checkout ≥ giờ đến THỰC TẾ + 7.5h làm + 1.5h nghỉ trưa (không theo giờ ghi trong đơn xin đi muộn).
 *   Thiếu thì tính theo tỷ lệ: giờ làm thực = (checkout − giờ đến) − nghỉ trưa, chia 7.5h.
 * - Đến sớm hơn giờ vào ca thì lấy giờ vào ca làm mốc (không có chuyện về sớm hơn 17:30).
 * - Có checkin mà chưa có checkout: 0 công (chưa đủ dữ liệu; Admin sửa tay được).
 * - Đến sau 10h mà KHÔNG có đơn được miễn: trừ thêm 1/2 công vào công thực, không phạt tiền.
 *   Có đơn được miễn thì tính công bình thường theo giờ thực tế (VD đến 10h, về 17h30 = 6/7.5 công; muốn đủ công phải ở lại tới 19h).
 */
export function calcDay(input: DayInput, schedule: WorkSchedule, config: LatePenaltyConfig): DayResult {
  const none: DayResult = { workUnits: 0, lateMinutes: 0, latePenalty: 0, halfDayDeducted: false };
  if (!input.workday) return none;
  if (input.exempt) return { ...none, workUnits: 1 };
  if (!input.checkIn) return none;

  const late = calcLate(input.checkIn, schedule, config);
  const halfDayDeducted = late.halfDayDeducted && !input.lateExcused;
  const base = { lateMinutes: late.lateMinutes, latePenalty: late.penalty, halfDayDeducted };
  if (!input.checkOut) return { ...base, workUnits: 0 };

  const shiftStart = toMinutes(schedule.morningStart);
  // Ngày VN của checkin (đổi mốc thời gian → số phút từ 00:00 cùng ngày)
  const effectiveStartMs = input.checkIn.getTime() + Math.max(0, shiftStart - minuteOfDayVN(input.checkIn)) * 60_000;
  const spanHours = (input.checkOut.getTime() - effectiveStartMs) / 3_600_000;
  const workedHours = Math.min(schedule.hoursPerDay, Math.max(0, spanHours - schedule.lunchBreakHours));
  let units = workedHours / schedule.hoursPerDay;
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
