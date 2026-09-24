import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { fullDateVN, timeVN, todayVNAsDbDate } from "@/lib/dates";

export default async function HomePage() {
  const user = await requireUser();
  const isLeader = user.role === "LEADER";

  const [today, myPending, teamPending] = await Promise.all([
    prisma.dailyAttendance.findUnique({
      where: { employeeId_date: { employeeId: user.id, date: todayVNAsDbDate() } },
    }),
    prisma.request.count({
      where: { employeeId: user.id, status: { in: ["PENDING", "LEADER_APPROVED"] }, deletedAt: null },
    }),
    isLeader && user.teamId
      ? prisma.request.count({
          where: {
            employee: { teamId: user.teamId },
            employeeId: { not: user.id },
            status: "PENDING",
            deletedAt: null,
          },
        })
      : 0,
  ]);

  return (
    <>
      <h1>Chào {user.name.split(" ").pop()}</h1>
      <div className="subtitle">{fullDateVN()}</div>

      <div className="grid3" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="stat-label">Công thực (tháng này)</div>
          <div className="stat-value" style={{ color: "var(--text-3)" }}>—</div>
        </div>
        <div className="card">
          <div className="stat-label">Đi muộn (tháng này)</div>
          <div className="stat-value" style={{ color: "var(--text-3)" }}>—</div>
        </div>
        <Link href="/requests" className="card">
          <div className="stat-label">Đơn chờ được duyệt</div>
          <div className="stat-value" style={{ color: myPending ? "var(--amber)" : undefined }}>{myPending}</div>
        </Link>
        {isLeader && (
          <Link href="/requests" className="card">
            <div className="stat-label">Đơn chưa duyệt (team)</div>
            <div className="stat-value" style={{ color: teamPending ? "var(--amber)" : undefined }}>{teamPending}</div>
          </Link>
        )}
      </div>

      <div className="section-title">Chấm công hôm nay</div>
      <div className="card" style={{ background: "var(--navy-soft)", border: "none", display: "flex", gap: 26 }}>
        <div>
          <div className="stat-label">Check-in</div>
          <div className="stat-value">{today?.checkIn ? timeVN(today.checkIn) : <span style={{ color: "var(--text-3)" }}>Chưa có</span>}</div>
        </div>
        <div>
          <div className="stat-label">Check-out</div>
          <div className="stat-value">{today?.checkOut ? timeVN(today.checkOut) : <span style={{ color: "var(--text-3)" }}>Chưa về</span>}</div>
        </div>
      </div>
    </>
  );
}
