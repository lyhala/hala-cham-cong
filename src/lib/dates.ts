// Mọi ngày giờ hiển thị theo giờ Việt Nam, dù server (Railway) chạy giờ UTC.
export const TZ = "Asia/Ho_Chi_Minh";

const WEEKDAYS = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

/** Ngày hôm nay (giờ VN) dạng "YYYY-MM-DD". */
export function todayVN(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

/** Ngày hôm nay (giờ VN) dạng Date 00:00 UTC — để so với cột @db.Date. */
export function todayVNAsDbDate(now = new Date()) {
  return new Date(`${todayVN(now)}T00:00:00Z`);
}

/** VD "Thứ Năm, 24 tháng 9, 2026" */
export function fullDateVN(now = new Date()) {
  const [y, m, d] = todayVN(now).split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${d} tháng ${m}, ${y}`;
}

/** VD "08:32" */
export function timeVN(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

/** VD "08:32 24/09/2026" */
export function dateTimeVN(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
