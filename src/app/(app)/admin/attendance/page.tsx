import Link from "next/link";
import { AttendanceCalendar, CalendarLegend, DayDetail } from "@/components/AttendanceCalendar";
import { requireRole } from "@/lib/auth/session";
import { getMonthAttendance, getMonthSummaries } from "@/lib/attendance";
import { prisma } from "@/lib/db";
import { currentMonthVN, isValidMonth, monthLabel, shiftMonth, timeVN, todayVN } from "@/lib/dates";
import { fmtMoney } from "@/lib/format";
import { EditDayForm } from "./_components/EditDayForm";

export default async function Page(props: PageProps<"/admin/attendance">) {
  await requireRole("ADMIN");
  const sp = await props.searchParams;
  const month = isValidMonth(sp.month) ? sp.month : currentMonthVN();
  const employeeId = typeof sp.employee === "string" ? sp.employee : "";

  const nav = (m: string) => (
    <div className="month-nav">
      <Link className="btn sm" href={`/admin/attendance?month=${shiftMonth(m, -1)}${employeeId ? `&employee=${employeeId}` : ""}`}>‹</Link>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{monthLabel(m)}</div>
      <Link className="btn sm" href={`/admin/attendance?month=${shiftMonth(m, 1)}${employeeId ? `&employee=${employeeId}` : ""}`}>›</Link>
    </div>
  );

  const employee = employeeId
    ? await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, code: true, name: true } })
    : null;

  return (
    <>
      <h1>Chấm công toàn công ty</h1>
      <div className="subtitle">Xem công theo tháng và sửa trực tiếp (mọi lần sửa đều được ghi nhật ký)</div>
      {nav(month)}
      {employee ? <EmployeeView month={month} employee={employee} selectedDay={typeof sp.day === "string" ? sp.day : ""} /> : <Overview month={month} />}
    </>
  );
}

async function Overview({ month }: { month: string }) {
  const { rows, standardDays } = await getMonthSummaries(month);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nhân sự</th>
            <th>Team</th>
            <th className="right">Công thực / {standardDays}</th>
            <th className="right">Lần muộn</th>
            <th className="right">Tiền phạt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link className="link" href={`/admin/attendance?month=${month}&employee=${r.id}`}>{r.name}</Link>{" "}
                <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>{r.code}</span>
                {r.exempt && <span className="badge neutral xs" style={{ marginLeft: 6 }}>Miễn chấm công</span>}
              </td>
              <td>{r.team ?? <span className="missing">Chưa chọn</span>}</td>
              <td className="right">{r.workUnits}</td>
              <td className="right">{r.lateDays || "—"}</td>
              <td className="right">{r.latePenalty ? `${fmtMoney(r.latePenalty)}đ` : "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="empty">Chưa có nhân sự đang làm</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

async function EmployeeView({ month, employee, selectedDay }: { month: string; employee: { id: string; code: string; name: string }; selectedDay: string }) {
  const today = todayVN();
  const { days, exempt, totals } = await getMonthAttendance(employee.id, month);
  const selected = days.find((d) => d.day === selectedDay) ?? days.find((d) => d.day === today) ?? days[0];

  return (
    <>
      <Link className="backbar" href={`/admin/attendance?month=${month}`}>← Tất cả nhân sự</Link>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
        {employee.name} <span style={{ color: "var(--text-3)", fontSize: 12 }}>{employee.code}</span>
      </div>
      {exempt && <div className="info-box">Nhân sự này được miễn chấm công: mọi ngày làm việc tự tính đủ công, không cần sửa.</div>}
      <div className="grid3" style={{ marginBottom: 14 }}>
        <div className="card"><div className="stat-label">Công thực</div><div className="stat-value">{totals.workUnits}<span style={{ fontSize: 12, color: "var(--text-3)" }}> / {totals.standardDays}</span></div></div>
        <div className="card"><div className="stat-label">Số lần đi muộn</div><div className="stat-value">{totals.lateDays}</div></div>
        <div className="card"><div className="stat-label">Tiền phạt đi muộn</div><div className="stat-value">{fmtMoney(totals.latePenalty)}<span style={{ fontSize: 12, color: "var(--text-3)" }}>đ</span></div></div>
      </div>
      <AttendanceCalendar
        days={days}
        today={today}
        selected={selected.day}
        hrefFor={(d) => `/admin/attendance?month=${month}&employee=${employee.id}&day=${d}`}
      />
      <CalendarLegend />
      <DayDetail day={selected}>
        {!exempt && (
          <EditDayForm
            key={selected.day}
            employeeId={employee.id}
            day={selected.day}
            checkIn={selected.checkIn ? timeVN(selected.checkIn) : ""}
            checkOut={selected.checkOut ? timeVN(selected.checkOut) : ""}
            workUnits={selected.workUnits}
            note={selected.note ?? ""}
            isManual={selected.isManual}
          />
        )}
      </DayDetail>
    </>
  );
}
