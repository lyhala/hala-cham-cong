import Link from "next/link";
import type { DayView } from "@/lib/attendance";
import { timeVN } from "@/lib/dates";
import { fmtMoney } from "@/lib/format";

const DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function dom(day: string) {
  return Number(day.slice(8));
}

/** Lịch tháng (T2 → CN), mỗi ô tô màu theo trạng thái công; bấm vào ô để chọn ngày. */
export function AttendanceCalendar({
  days,
  today,
  selected,
  hrefFor,
}: {
  days: DayView[];
  today: string;
  selected: string | null;
  hrefFor: (day: string) => string;
}) {
  // Thứ của ngày 1 (T2 = 0) để chừa ô trống đầu tháng
  const [y, m] = days[0].day.split("-").map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;

  return (
    <div className="cal">
      {DOW.map((d) => (
        <div key={d} className="dow">{d}</div>
      ))}
      {Array.from({ length: offset }, (_, i) => (
        <div key={`b${i}`} />
      ))}
      {days.map((d) => (
        <Link
          key={d.day}
          href={hrefFor(d.day)}
          scroll={false}
          className={`day ${d.status}${d.day === today ? " today" : ""}${d.day === selected ? " picked" : ""}`}
        >
          {dom(d.day)}
        </Link>
      ))}
    </div>
  );
}

export function CalendarLegend() {
  return (
    <div className="cal-legend">
      <span><i className="ok" /> Đủ công</span>
      <span><i className="issue" /> Chưa đủ công</span>
      <span><i className="off" /> Ngày nghỉ</span>
    </div>
  );
}

function statusLabel(d: DayView) {
  if (!d.workday) return d.isHoliday ? "Ngày lễ" : "Ngày nghỉ";
  switch (d.status) {
    case "future":
      return "Chưa tới";
    case "ok":
      return "Đủ công";
    default:
      if (!d.checkIn) return "Không có dữ liệu chấm công";
      return d.lateMinutes > 0 ? "Đi muộn" : "Chưa đủ công";
  }
}

const STATUS_BADGE: Record<DayView["status"], string> = { ok: "ok", issue: "danger", off: "neutral", future: "neutral" };

/** Chi tiết 1 ngày: giờ vào/ra, số công, phút muộn, tiền phạt. */
export function DayDetail({ day, children }: { day: DayView; children?: React.ReactNode }) {
  const [, m, dd] = day.day.split("-");
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Ngày {Number(dd)}/{m}</div>
        <div style={{ display: "flex", gap: 6 }}>
          {day.isManual && <span className="badge warn xs">Admin đã sửa</span>}
          <span className={`badge ${STATUS_BADGE[day.status]} xs`}>{statusLabel(day)}</span>
        </div>
      </div>
      {day.leaveLabel && <div className="info-box" style={{ marginBottom: 8 }}>Đơn đã duyệt: {day.leaveLabel}{day.paidUnits > 0 ? ` (+${day.paidUnits} công)` : " (không tính công)"}</div>}
      {day.calendarNote && <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 6 }}>{day.calendarNote}</div>}
      <div className="grid3">
        <div><div className="stat-label">Check-in</div><b>{day.checkIn ? timeVN(day.checkIn) : "—"}</b></div>
        <div><div className="stat-label">Check-out</div><b>{day.checkOut ? timeVN(day.checkOut) : day.checkIn ? "Chưa về" : "—"}</b></div>
        <div><div className="stat-label">Số công</div><b>{Math.min(1, day.workUnits + day.paidUnits)}</b></div>
        <div><div className="stat-label">Đi muộn</div><b>{day.lateMinutes > 0 ? `${day.lateMinutes} phút` : "—"}</b></div>
        <div>
          <div className="stat-label">Tiền phạt</div>
          <b>{day.latePenalty > 0 ? `${fmtMoney(day.latePenalty)}đ` : "—"}</b>
          {day.latePenalty > 0 && day.lateExcused && <div style={{ fontSize: 11, color: "var(--success)" }}>Được miễn (có đơn)</div>}
        </div>
      </div>
      {day.halfDayDeducted && (
        <div className="warn-box" style={{ marginTop: 10, marginBottom: 0 }}>Đến sau 10h, không có đơn được miễn: trừ 0,5 công.</div>
      )}
      {day.note && <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 8 }}>Ghi chú: {day.note}</div>}
      {children}
    </div>
  );
}
