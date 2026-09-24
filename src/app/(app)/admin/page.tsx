import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { todayVN } from "@/lib/dates";

export default async function AdminDashboard() {
  await requireRole("ADMIN");
  const [year, month] = todayVN().split("-");

  // Không tính tài khoản Admin; nhân sự chưa chọn Role (null) vẫn tính.
  const notAdmin = { OR: [{ role: null }, { role: { not: "ADMIN" as const } }] };

  const [activeCount, pendingCount, missingInfo] = await Promise.all([
    prisma.employee.count({ where: { status: "ACTIVE", ...notAdmin } }),
    prisma.request.count({ where: { status: { in: ["PENDING", "LEADER_APPROVED"] }, deletedAt: null } }),
    prisma.employee.findMany({
      where: { status: "ACTIVE", AND: [notAdmin, { OR: [{ teamId: null }, { role: null }, { email: null }] }] },
      select: { id: true, code: true, name: true, teamId: true, role: true, email: true },
      orderBy: { code: "asc" },
    }),
  ]);

  return (
    <>
      <h1>Home</h1>
      <div className="subtitle">Tổng quan công ty — Tháng {Number(month)}/{year}</div>
      <div className="grid3">
        <div className="card">
          <div className="stat-label">Tổng nhân sự</div>
          <div className="stat-value">{activeCount}</div>
        </div>
        <Link href="/admin/approvals" className="card">
          <div className="stat-label">Đơn chờ duyệt</div>
          <div className="stat-value" style={{ color: pendingCount ? "var(--amber)" : undefined }}>{pendingCount}</div>
        </Link>
        <div className="card">
          <div className="stat-label">Hồ sơ thiếu thông tin</div>
          <div className="stat-value" style={{ color: missingInfo.length ? "var(--danger)" : undefined }}>{missingInfo.length}</div>
        </div>
      </div>

      <div className="section-title">Cảnh báo nhanh</div>
      {missingInfo.length === 0 ? (
        <div className="card empty">Không có cảnh báo nào</div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table>
            <tbody>
              {missingInfo.map((e) => (
                <tr key={e.id}>
                  <td style={{ borderTop: "none" }}>{e.code}</td>
                  <td style={{ borderTop: "none" }}>{e.name}</td>
                  <td style={{ borderTop: "none", color: "var(--danger)", fontSize: 11.5 }}>
                    Chưa chọn: {[!e.teamId && "Team", !e.role && "Role", !e.email && "Email"].filter(Boolean).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
