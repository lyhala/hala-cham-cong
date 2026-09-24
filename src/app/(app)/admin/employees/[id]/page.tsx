import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { todayVN } from "@/lib/dates";
import { Avatar, photoUrl } from "@/components/Avatar";
import { fmtDate, fmtMoney, initials, toDateInput } from "@/lib/format";
import { deleteSalaryHistory } from "../actions";
import { AccountPanel } from "../_components/AccountPanel";
import { ActionButton } from "../_components/ActionButton";
import { EmployeeForm } from "../_components/EmployeeForm";
import { PhotoUploader } from "../_components/PhotoUploader";
import { SalaryForm } from "../_components/SalaryForm";

export default async function EmployeeDetailPage(props: PageProps<"/admin/employees/[id]">) {
  const admin = await requireRole("ADMIN");
  const { id } = await props.params;

  const [e, teams] = await Promise.all([
    prisma.employee.findUnique({
      where: { id },
      include: {
        team: true,
        leadsTeam: true,
        photo: { select: { updatedAt: true } },
        salaryHistory: { orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }], include: { createdBy: { select: { name: true } } } },
      },
    }),
    prisma.team.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, type: true } }),
  ]);
  if (!e) notFound();

  const today = todayVN();
  // Mốc lương đang hiệu lực = mốc mới nhất có ngày hiệu lực <= hôm nay
  const current = e.salaryHistory.find((s) => toDateInput(s.effectiveFrom) <= today);
  const resigned = e.status === "RESIGNED";

  return (
    <div style={{ maxWidth: 720 }}>
      <Link href="/admin/employees" className="backbar">← Nhân sự</Link>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Avatar id={e.id} name={e.name} photoUpdatedAt={e.photo?.updatedAt} size={44} />
        <div>
          <h1 style={{ marginBottom: 2 }}>{e.name}</h1>
          <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {e.code}
            {e.isCEO && <span className="badge ok xs">CEO</span>}
            {e.leadsTeam && <span className="badge warn xs">Leader {e.leadsTeam.name}</span>}
            {resigned && <span className="badge danger xs">Đã nghỉ từ {fmtDate(e.leftAt)}</span>}
            {!resigned && e.isLocked && <span className="badge danger xs">Tài khoản đã khóa</span>}
            {!resigned && !e.isLocked && e.email && (
              <span style={{ color: "var(--text-3)" }}>· {e.lastLoginAt ? "đã từng đăng nhập" : "chưa đăng nhập lần nào"}</span>
            )}
          </div>
        </div>
      </div>

      {e.role === "LEADER" && !e.leadsTeam && (
        <div className="warn-box">Role là Leader nhưng chưa là Leader của team nào — hãy chọn Team rồi lưu lại.</div>
      )}

      <div className="section-title">Ảnh FaceID</div>
      <div className="card" style={{ marginBottom: 16 }}>
        <PhotoUploader
          employeeId={e.id}
          code={e.code}
          photoUrl={e.photo ? photoUrl(e.id, e.photo.updatedAt) : null}
          initials={initials(e.name)}
        />
      </div>

      <div className="section-title">Thông tin</div>
      <EmployeeForm
        mode="edit"
        teams={teams}
        values={{
          id: e.id,
          code: e.code,
          name: e.name,
          email: e.email ?? "",
          phone: e.phone ?? "",
          address: e.address ?? "",
          teamId: e.teamId ?? "",
          role: e.role ?? "",
          joinedAt: toDateInput(e.joinedAt),
          isCEO: e.isCEO,
          attendanceExempt: e.attendanceExempt,
          noProject: e.noProject,
          parkingOutside: e.parkingOutside,
        }}
      />

      <div className="section-title" style={{ marginTop: 24 }}>Lịch sử lương</div>
      <div className="card">
        <div className="grid2" style={{ marginBottom: 12 }}>
          <div>
            <div className="stat-label">Lương base hiện tại</div>
            <div className="stat-value" style={{ fontSize: 17 }}>{current ? `${fmtMoney(current.baseSalary)}đ` : "—"}</div>
          </div>
          <div>
            <div className="stat-label">Lương performance hiện tại</div>
            <div className="stat-value" style={{ fontSize: 17 }}>{current ? `${fmtMoney(current.perfSalary)}đ` : "—"}</div>
          </div>
        </div>
        {e.salaryHistory.length === 0 ? (
          <div className="empty" style={{ paddingTop: 0 }}>Chưa có mốc lương nào</div>
        ) : (
          <div className="table-wrap" style={{ marginBottom: 12, boxShadow: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Hiệu lực từ</th>
                  <th className="right">Lương base</th>
                  <th className="right">Performance</th>
                  <th>Ghi chú</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {e.salaryHistory.map((s) => (
                  <tr key={s.id} style={s.id === current?.id ? { background: "var(--success-bg)" } : undefined}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {fmtDate(s.effectiveFrom)}
                      {s.id === current?.id && <div style={{ fontSize: 10.5, color: "var(--success)" }}>đang hiệu lực</div>}
                      {toDateInput(s.effectiveFrom) > today && <div style={{ fontSize: 10.5, color: "var(--amber)" }}>sắp hiệu lực</div>}
                    </td>
                    <td className="right">{fmtMoney(s.baseSalary)}</td>
                    <td className="right">{fmtMoney(s.perfSalary)}</td>
                    <td style={{ fontSize: 12, color: "var(--text-2)" }}>
                      {s.note ?? ""}
                      {s.createdBy && <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>bởi {s.createdBy.name}</div>}
                    </td>
                    <td>
                      <ActionButton
                        action={deleteSalaryHistory}
                        fields={{ id: s.id }}
                        label="✕"
                        className="icon-btn"
                        title="Xóa mốc lương (nhập nhầm)"
                        confirm={`Xóa mốc lương hiệu lực từ ${fmtDate(s.effectiveFrom)}? Chỉ nên xóa khi nhập nhầm.`}
                        showResult={false}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <SalaryForm employeeId={e.id} today={today} lastBase={e.salaryHistory[0]?.baseSalary ?? null} lastPerf={e.salaryHistory[0]?.perfSalary ?? null} />
      </div>

      <div className="section-title" style={{ marginTop: 24 }}>Tài khoản đăng nhập</div>
      <div className="card">
        <AccountPanel
          id={e.id}
          name={e.name}
          hasEmail={!!e.email}
          isLocked={e.isLocked}
          resigned={resigned}
          isSelf={e.id === admin.id}
          today={today}
        />
      </div>
    </div>
  );
}
