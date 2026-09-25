// Quy tắc đơn từ (spec §5, §4, §3.3). Hàm thuần: không đụng DB để dễ kiểm tra.

import type { DayPortion, LeaveSubtype, RequestStatus, RequestType } from "@/generated/prisma/enums";

export const TYPE_LABEL: Record<RequestType, string> = {
  OT: "OT (làm thêm)",
  LATE: "Đi muộn",
  EARLY_LEAVE: "Về sớm",
  LEAVE: "Nghỉ",
  WFH: "WFH",
  SALARY_ADVANCE: "Tạm ứng lương",
};

export const LEAVE_LABEL: Record<LeaveSubtype, string> = {
  ANNUAL: "Nghỉ phép",
  UNPAID: "Nghỉ không lương",
  MARRIAGE: "Nghỉ kết hôn",
  FUNERAL: "Nghỉ tang lễ",
};

export const PORTION_LABEL: Record<DayPortion, string> = { FULL: "Cả ngày", MORNING: "Sáng", AFTERNOON: "Chiều" };

export const STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: "Chờ duyệt",
  LEADER_APPROVED: "Leader đã duyệt, chờ Admin",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  WITHDRAWN: "Đã thu hồi",
};

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Mọi ngày "YYYY-MM-DD" từ from đến to (gồm cả 2 đầu). */
export function daysInRange(from: string, to: string) {
  const out: string[] = [];
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= end && out.length < 400; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Số giờ giữa 2 mốc "HH:mm"; qua nửa đêm thì cộng 24h (OT 22h → 02h = 4h). */
export function hoursBetween(from: string, to: string) {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  let minutes = th * 60 + tm - (fh * 60 + fm);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

export type RequestInput = {
  type: RequestType;
  leaveSubtype: LeaveSubtype | null;
  dateFrom: string | null;
  dateTo: string | null;
  dayPortion: DayPortion | null;
  timeFrom: string | null;
  timeTo: string | null;
  amount: number | null;
  reason: string;
};

/**
 * Kiểm tra đơn theo loại (spec §5, "field thay đổi theo loại"):
 * OT / Đi muộn / Về sớm: 1 ngày + khung giờ · Nghỉ / WFH: khoảng ngày (nửa ngày chỉ cho đơn 1 ngày) · Tạm ứng: số tiền.
 * Trả về thông báo lỗi tiếng Việt, hoặc null nếu hợp lệ.
 */
export function validateRequest(r: RequestInput): string | null {
  if (!r.reason.trim()) return "Vui lòng nhập lý do";
  if (r.reason.length > 500) return "Lý do quá dài (tối đa 500 ký tự)";

  switch (r.type) {
    case "SALARY_ADVANCE":
      if (!r.amount || r.amount <= 0) return "Vui lòng nhập số tiền tạm ứng";
      return null;
    case "OT":
    case "LATE":
    case "EARLY_LEAVE":
      if (!r.dateFrom || !isDay(r.dateFrom)) return "Vui lòng chọn ngày";
      if (!r.timeFrom || !isTime(r.timeFrom) || !r.timeTo || !isTime(r.timeTo)) return "Vui lòng nhập khung giờ (từ – đến)";
      if (r.type === "OT" && hoursBetween(r.timeFrom, r.timeTo) > 12) return "OT tối đa 12 giờ mỗi đơn";
      if (r.type !== "OT" && r.timeTo <= r.timeFrom) return "Giờ đến phải sau giờ bắt đầu";
      return null;
    case "LEAVE":
    case "WFH":
      if (r.type === "LEAVE" && !r.leaveSubtype) return "Vui lòng chọn loại nghỉ";
      if (!r.dateFrom || !r.dateTo || !isDay(r.dateFrom) || !isDay(r.dateTo)) return "Vui lòng chọn khoảng ngày";
      if (r.dateTo < r.dateFrom) return "Ngày kết thúc phải từ ngày bắt đầu trở đi";
      if (daysInRange(r.dateFrom, r.dateTo).length > 60) return "Khoảng ngày quá dài (tối đa 60 ngày)";
      if (r.dayPortion && r.dayPortion !== "FULL" && r.dateFrom !== r.dateTo) return "Nghỉ nửa ngày chỉ áp dụng cho đơn 1 ngày";
      return null;
  }
}

/** Số ngày công của đơn Nghỉ/WFH nằm trong tháng "YYYY-MM": chỉ đếm ngày làm việc; nửa ngày = 0,5. */
export function leaveUnitsInMonth(
  r: { dateFrom: string; dateTo: string; dayPortion: DayPortion | null },
  month: string,
  isWorkday: (day: string) => boolean,
) {
  const perDay = !r.dayPortion || r.dayPortion === "FULL" ? 1 : 0.5;
  return daysInRange(r.dateFrom, r.dateTo).filter((d) => d.startsWith(month) && isWorkday(d)).length * perDay;
}

/** Loại ngày để chọn hệ số OT: lễ tết (3x) > cuối tuần / ngày nghỉ (2x) > ngày thường (1.5x). */
export function otDayKind(day: { isHoliday: boolean; workday: boolean }): "weekday" | "weekend" | "holiday" {
  if (day.isHoliday) return "holiday";
  return day.workday ? "weekday" : "weekend";
}

/**
 * Duyệt 1 cấp: Leader HOẶC Admin duyệt xong là APPROVED.
 * Duyệt 2 cấp: Leader duyệt → LEADER_APPROVED (chờ Admin); Admin duyệt → APPROVED (Admin được duyệt thẳng, không cần chờ Leader).
 * Trả về null nếu vai trò này không được duyệt đơn ở trạng thái hiện tại.
 */
export function nextStatusOnApprove(levels: 1 | 2, status: RequestStatus, actor: "LEADER" | "ADMIN"): RequestStatus | null {
  if (status === "PENDING") return levels === 2 && actor === "LEADER" ? "LEADER_APPROVED" : "APPROVED";
  if (status === "LEADER_APPROVED") return actor === "ADMIN" ? "APPROVED" : null;
  return null;
}

/**
 * Cảnh báo "sẽ không được miễn phạt" của đơn đi muộn: chỉ 3 đơn có ngày đi muộn SỚM NHẤT trong tháng được miễn (§3.3).
 * `otherDays`: ngày của các đơn đi muộn khác trong cùng tháng (đã duyệt — hoặc gồm cả đang chờ khi cảnh báo lúc tạo đơn).
 */
export function lateExemptionWarning(day: string, otherDays: string[], free: number) {
  const all = [...new Set([...otherDays, day])].sort();
  if (all.slice(0, free).includes(day)) return null;
  return `Đơn này sẽ KHÔNG được miễn phạt dù được duyệt: tháng này đã có ${free} đơn đi muộn có ngày sớm hơn (chỉ ${free} đơn có ngày sớm nhất được miễn).`;
}
