import Link from "next/link";
import { AttendanceCalendar, CalendarLegend, DayDetail } from "@/components/AttendanceCalendar";
import { requireUser } from "@/lib/auth/session";
import { getMonthAttendance } from "@/lib/attendance";
import { currentMonthVN, isValidMonth, monthLabel, shiftMonth, timeVN, todayVN } from "@/lib/dates";
import { fmtMoney } from "@/lib/format";

export default async function Page(props: PageProps<"/attendance">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const thisMonth = currentMonthVN();
  const month = isValidMonth(sp.month) ? sp.month : thisMonth;
  const today = todayVN();

  const { days, exempt, totals } = await getMonthAttendance(user.id, month);
  const todayView = days.find((d) => d.day === today);
  // Mặc định chọn hôm nay (tháng hiện tại) hoặc ngày 1 của tháng đang xem
  const selected = days.find((d) => d.day === sp.day) ?? todayView ?? days[0];

  const href = (m: string, day?: string) => `/attendance?month=${m}${day ? `&day=${day}` : ""}`;

  return (
    <>
      <h1>Chấm công</h1>
      <div className="subtitle">Công của tôi theo tháng</div>

      {todayView && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="stat-label">Hôm nay</div>
          <div className="grid2">
            <div><div className="stat-label">Check-in</div><div className="stat-value">{todayView.checkIn ? timeVN(todayView.checkIn) : "—"}</div></div>
            <div><div className="stat-label">Check-out</div><div className="stat-value" style={{ color: todayView.checkOut ? undefined : "var(--text-3)" }}>{todayView.checkOut ? timeVN(todayView.checkOut) : "Chưa về"}</div></div>
          </div>
        </div>
      )}

      <div className="month-nav">
        <Link className="btn sm" href={href(shiftMonth(month, -1))}>‹</Link>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{monthLabel(month)}</div>
        <Link className="btn sm" href={href(shiftMonth(month, 1))}>›</Link>
      </div>

      {exempt && <div className="info-box">Bạn được miễn chấm công: mọi ngày làm việc tự tính đủ công.</div>}

      <div className="grid3" style={{ marginBottom: 14 }}>
        <div className="card"><div className="stat-label">Công thực</div><div className="stat-value">{totals.workUnits}<span style={{ fontSize: 12, color: "var(--text-3)" }}> / {totals.standardDays}</span></div></div>
        <div className="card"><div className="stat-label">Số lần đi muộn</div><div className="stat-value">{totals.lateDays}</div></div>
        <div className="card"><div className="stat-label">Tiền phạt đi muộn</div><div className="stat-value">{fmtMoney(totals.latePenalty)}<span style={{ fontSize: 12, color: "var(--text-3)" }}>đ</span></div></div>
      </div>

      <AttendanceCalendar days={days} today={today} selected={selected.day} hrefFor={(d) => href(month, d)} />
      <CalendarLegend />
      <DayDetail day={selected} />
    </>
  );
}
