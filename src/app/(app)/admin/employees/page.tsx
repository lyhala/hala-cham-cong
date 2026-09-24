import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { initials } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/nav";
import type { Prisma } from "@/generated/prisma/client";
import { removeFromTeam } from "./actions";
import { ActionButton } from "./_components/ActionButton";
import { CreateTeamForm, TeamEditor } from "./_components/TeamForms";

const TEAM_TYPE_BADGE = {
  PRODUCTION: <span className="badge neutral xs">Sản xuất</span>,
  SUPPORT: <span className="badge ok xs">Hỗ trợ</span>,
};

export default async function EmployeesPage(props: PageProps<"/admin/employees">) {
  await requireRole("ADMIN");
  const sp = await props.searchParams;
  const tab = sp.tab === "org" ? "org" : "list";

  return (
    <>
      <h1>Nhân sự</h1>
      <div className="tabs" style={{ marginTop: 10 }}>
        <Link className={`btn sm ${tab === "list" ? "primary" : ""}`} href="/admin/employees">Danh sách</Link>
        <Link className={`btn sm ${tab === "org" ? "primary" : ""}`} href="/admin/employees?tab=org">Sơ đồ tổ chức</Link>
      </div>
      {tab === "list" ? (
        <EmployeeList q={typeof sp.q === "string" ? sp.q : ""} status={sp.status === "resigned" ? "resigned" : "active"} />
      ) : (
        <OrgChart />
      )}
    </>
  );
}

// ───────────────────────── Tab Danh sách ─────────────────────────

async function EmployeeList({ q, status }: { q: string; status: "active" | "resigned" }) {
  const where: Prisma.EmployeeWhereInput = {
    status: status === "active" ? "ACTIVE" : "RESIGNED",
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [list, resignedCount] = await Promise.all([
    prisma.employee.findMany({ where, include: { team: true }, orderBy: { code: "asc" } }),
    prisma.employee.count({ where: { status: "RESIGNED" } }),
  ]);

  return (
    <>
      <form className="toolbar" action="/admin/employees">
        <input name="q" defaultValue={q} placeholder="Tìm tên, Mã NV, email..." style={{ flex: "1 1 180px" }} />
        <select name="status" defaultValue={status}>
          <option value="active">Đang làm</option>
          <option value="resigned">Đã nghỉ ({resignedCount})</option>
        </select>
        <button className="btn sm" type="submit">Lọc</button>
        <Link className="btn primary sm" href="/admin/employees/new" style={{ marginLeft: "auto" }}>+ Thêm nhân sự</Link>
      </form>
      <div className="subtitle" style={{ marginBottom: 10 }}>{list.length} người</div>

      {list.length === 0 ? (
        <div className="card empty">{q ? "Không tìm thấy ai" : "Chưa có nhân sự nào. Bấm \"+ Thêm nhân sự\" để bắt đầu."}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã NV</th>
                <th>Tên</th>
                <th>Team</th>
                <th>Role</th>
                <th>Tài khoản</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{e.code}</td>
                  <td>
                    <Link href={`/admin/employees/${e.id}`} className="link" style={{ fontWeight: 500 }}>{e.name}</Link>
                    {e.isCEO && <> <span className="badge ok xs">CEO</span></>}
                  </td>
                  <td>{e.team ? <span className="badge neutral">{e.team.name}</span> : <span className="missing">Chưa chọn</span>}</td>
                  <td>{e.role ? ROLE_LABEL[e.role] : <span className="missing">Chưa chọn</span>}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 11.5 }}>
                    {e.status === "RESIGNED" ? (
                      <span className="badge danger">Đã nghỉ</span>
                    ) : e.isLocked ? (
                      <span className="badge danger">Đã khóa</span>
                    ) : !e.email ? (
                      <span className="missing">Chưa có email</span>
                    ) : e.lastLoginAt ? (
                      <span className="badge ok">Đã đăng nhập</span>
                    ) : (
                      <span className="badge warn">Chưa đăng nhập</span>
                    )}
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

// ───────────────────────── Tab Sơ đồ tổ chức ─────────────────────────

async function OrgChart() {
  const [teams, ceo, unassigned] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        leader: { select: { id: true, name: true } },
        members: { where: { status: "ACTIVE" }, orderBy: { name: "asc" } },
      },
    }),
    prisma.employee.findFirst({ where: { isCEO: true, status: "ACTIVE" } }),
    prisma.employee.findMany({ where: { teamId: null, status: "ACTIVE", isCEO: false }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <div className="subtitle">
        Bấm vào team để mở / đóng danh sách. Bấm vào tên để mở hồ sơ. Thêm / gỡ ở đây tự đồng bộ với tab Danh sách.
      </div>

      <div style={{ textAlign: "center", margin: "6px 0 4px" }}>
        {ceo ? (
          <Link href={`/admin/employees/${ceo.id}`} className="card" style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 18px" }}>
            <div className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{initials(ceo.name)}</div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{ceo.name}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-2)" }}>CEO</div>
            </div>
          </Link>
        ) : (
          <div className="card" style={{ display: "inline-block", padding: "10px 18px", fontSize: 12.5, color: "var(--text-3)" }}>
            Chưa gán CEO (tick &quot;CEO&quot; trong hồ sơ nhân sự)
          </div>
        )}
      </div>
      <div style={{ width: 1, height: 18, background: "var(--border)", margin: "0 auto" }} />
      <div style={{ height: 1, background: "var(--border)", maxWidth: 640, margin: "0 auto 18px" }} />

      <div className="org-grid">
        {teams.map((t) => (
          <details key={t.id} className="card team-card">
            <summary>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {t.name} {TEAM_TYPE_BADGE[t.type]}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>
                  {t.members.length} người · {t.leader ? `Leader: ${t.leader.name}` : <span className="missing">Chưa có Leader</span>}
                </div>
              </div>
              <span className="chev">▸</span>
            </summary>
            <div className="team-body">
              {t.members.length === 0 && <div style={{ fontSize: 12, color: "var(--text-3)", padding: "4px 0" }}>Chưa có ai</div>}
              {t.members.map((m) => (
                <div key={m.id} className="member-row">
                  <div className="avatar" style={{ width: 24, height: 24, fontSize: 9.5 }}>{initials(m.name)}</div>
                  <Link href={`/admin/employees/${m.id}`}>
                    {m.name}
                    {t.leader?.id === m.id && <> <span className="badge warn xs">Leader</span></>}
                    {m.isCEO && <> <span className="badge ok xs">CEO</span></>}
                  </Link>
                  <ActionButton
                    action={removeFromTeam}
                    fields={{ id: m.id }}
                    label="✕"
                    className="icon-btn"
                    title="Gỡ khỏi team"
                    confirm={`Gỡ ${m.name} khỏi team ${t.name}? (Không xóa nhân sự, chỉ chuyển về "Chưa chọn" team)`}
                    showResult={false}
                  />
                </div>
              ))}
              <Link className="btn sm" style={{ marginTop: 6 }} href={`/admin/employees/new?team=${t.id}`}>
                + Thêm vào team này
              </Link>
              <TeamEditor team={{ id: t.id, name: t.name, type: t.type, memberCount: t.members.length }} />
            </div>
          </details>
        ))}

        {unassigned.length > 0 && (
          <details className="card team-card" open style={{ borderColor: "var(--danger)" }}>
            <summary>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--danger)" }}>Chưa chọn team</div>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>{unassigned.length} người</div>
              </div>
              <span className="chev">▸</span>
            </summary>
            <div className="team-body">
              {unassigned.map((m) => (
                <div key={m.id} className="member-row">
                  <div className="avatar" style={{ width: 24, height: 24, fontSize: 9.5 }}>{initials(m.name)}</div>
                  <Link href={`/admin/employees/${m.id}`}>
                    {m.name} {m.role ? <span style={{ color: "var(--text-3)", fontSize: 11 }}>· {ROLE_LABEL[m.role]}</span> : null}
                  </Link>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="toolbar" style={{ marginTop: 16 }}>
        <CreateTeamForm />
      </div>
    </>
  );
}
