import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { sortByEmployeeCode } from "@/lib/employee-order";
import { todayVN } from "@/lib/dates";
import { annualLeaveBalances } from "@/lib/requests-db";
import { ROLE_LABEL } from "@/lib/nav";
import type { Prisma } from "@/generated/prisma/client";
import { removeFromTeam } from "./actions";
import { ActionButton } from "./_components/ActionButton";
import { AutoSubmitForm } from "./_components/AutoSubmitForm";
import { AddExistingToTeamForm, CreateTeamForm, TeamEditor } from "./_components/TeamForms";

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
        <EmployeeList
          filters={{
            q: str(sp.q),
            status: sp.status === "resigned" ? "resigned" : "active",
            team: str(sp.team),
            role: str(sp.role),
            account: str(sp.account),
          }}
        />
      ) : (
        <OrgChart />
      )}
    </>
  );
}

// ───────────────────────── Tab Danh sách ─────────────────────────

function str(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

type Filters = { q: string; status: "active" | "resigned"; team: string; role: string; account: string };

const ACCOUNT_FILTERS: Record<string, { label: string; where: Prisma.EmployeeWhereInput }> = {
  logged_in: { label: "Đã đăng nhập", where: { isLocked: false, email: { not: null }, lastLoginAt: { not: null } } },
  never: { label: "Chưa đăng nhập", where: { isLocked: false, email: { not: null }, lastLoginAt: null } },
  no_email: { label: "Chưa có email", where: { email: null } },
  locked: { label: "Đã khóa", where: { isLocked: true } },
};

async function EmployeeList({ filters }: { filters: Filters }) {
  const { q, status, team, role, account } = filters;
  const and: Prisma.EmployeeWhereInput[] = [{ status: status === "active" ? "ACTIVE" : "RESIGNED" }];
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (team) and.push({ teamId: team === "none" ? null : team });
  if (role === "none") and.push({ role: null });
  else if (role === "EMPLOYEE" || role === "LEADER" || role === "ADMIN") and.push({ role });
  if (ACCOUNT_FILTERS[account]) and.push(ACCOUNT_FILTERS[account].where);

  const [rawList, resignedCount, teams] = await Promise.all([
    prisma.employee.findMany({
      where: { AND: and },
      include: { team: true, photo: { select: { updatedAt: true } } },
    }),
    prisma.employee.count({ where: { status: "RESIGNED" } }),
    prisma.team.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const filtered = Boolean(q || team || role || account);
  const list = sortByEmployeeCode(rawList, (e) => e.code); // theo mã NV (ADM → NV001 → NV002...)
  // Phép tồn năm nay (đã tích lũy − đã nghỉ − đang chờ duyệt), tính 1 lần cho cả danh sách
  const year = Number(todayVN().slice(0, 4));
  const leave = await annualLeaveBalances(list.filter((e) => e.status === "ACTIVE").map((e) => e.id), year);

  return (
    <>
      <AutoSubmitForm className="toolbar" action="/admin/employees">
        <input name="q" defaultValue={q} placeholder="Tìm tên, Mã NV, email..." style={{ flex: "1 1 180px" }} />
        <button className="btn sm" type="submit">Tìm</button>
        <Link className="btn primary sm" href="/admin/employees/new" style={{ marginLeft: "auto" }}>+ Thêm nhân sự</Link>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: "100%" }}>
          <select name="status" defaultValue={status} aria-label="Trạng thái làm việc">
            <option value="active">Đang làm</option>
            <option value="resigned">Đã nghỉ ({resignedCount})</option>
          </select>
          <select name="team" defaultValue={team} aria-label="Team">
            <option value="">Mọi team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
            <option value="none">Chưa chọn team</option>
          </select>
          <select name="role" defaultValue={role} aria-label="Role">
            <option value="">Mọi role</option>
            <option value="EMPLOYEE">Nhân viên</option>
            <option value="LEADER">Leader</option>
            <option value="ADMIN">Admin</option>
            <option value="none">Chưa chọn role</option>
          </select>
          <select name="account" defaultValue={account} aria-label="Tài khoản">
            <option value="">Mọi trạng thái tài khoản</option>
            {Object.entries(ACCOUNT_FILTERS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          {filtered && <Link className="btn sm" href={status === "resigned" ? "/admin/employees?status=resigned" : "/admin/employees"}>✕ Bỏ lọc</Link>}
        </div>
      </AutoSubmitForm>
      <div className="subtitle" style={{ marginBottom: 10 }}>{list.length} người</div>

      {list.length === 0 ? (
        <div className="card empty">{filtered ? "Không có ai khớp điều kiện lọc" : "Chưa có nhân sự nào. Bấm \"+ Thêm nhân sự\" để bắt đầu."}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã NV</th>
                <th>Tên</th>
                <th>Team</th>
                <th>Role</th>
                <th className="right" title="Phép năm đã tích lũy trừ phép đã nghỉ và đang chờ duyệt. Tồn cuối năm được quy đổi ra lương.">Phép tồn {year}</th>
                <th>Tài khoản</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{e.code}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar id={e.id} name={e.name} photoUpdatedAt={e.photo?.updatedAt} size={28} />
                      <div>
                        <Link href={`/admin/employees/${e.id}`} className="link" style={{ fontWeight: 500 }}>{e.name}</Link>
                        {e.isCEO && <> <span className="badge ok xs">CEO</span></>}
                      </div>
                    </div>
                  </td>
                  <td>{e.team ? <span className="badge neutral">{e.team.name}</span> : <span className="missing">Chưa chọn</span>}</td>
                  <td>{e.role ? ROLE_LABEL[e.role] : <span className="missing">Chưa chọn</span>}</td>
                  <td className="right" style={{ whiteSpace: "nowrap" }}>
                    {(() => {
                      const b = leave.get(e.id);
                      if (!b) return "—";
                      if (b.accrued === 0 && b.eligibleFrom > `${year}-${String(b.uptoMonth).padStart(2, "0")}`) return <span className="badge neutral xs" title={`Thử việc, tính phép từ tháng ${b.eligibleFrom.slice(5)}/${b.eligibleFrom.slice(0, 4)}`}>Thử việc</span>;
                      return <b title={`Tích lũy ${b.accrued} · đã nghỉ ${b.used}${b.pending ? ` · chờ duyệt ${b.pending}` : ""}`}>{b.remaining}</b>;
                    })()}
                  </td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 11.5 }}>
                    {e.status === "RESIGNED" ? (
                      e.isLocked ? (
                        <span className="badge danger">Đã nghỉ · đã khóa</span>
                      ) : (
                        <span className="badge warn">Đã nghỉ · còn xem Lương</span>
                      )
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
  const [teams, ceo, unassigned, people] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        leader: { select: { id: true, name: true } },
        displayLeader: { select: { id: true, name: true } },
        members: {
          where: { status: "ACTIVE" },
          orderBy: { name: "asc" },
          include: { photo: { select: { updatedAt: true } } },
        },
      },
    }),
    prisma.employee.findFirst({ where: { isCEO: true, status: "ACTIVE" }, include: { photo: { select: { updatedAt: true } } } }),
    prisma.employee.findMany({
      where: { teamId: null, status: "ACTIVE", isCEO: false },
      orderBy: { name: "asc" },
      include: { photo: { select: { updatedAt: true } } },
    }),
    prisma.employee.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
  ]);

  return (
    <>
      <div className="subtitle">
        Bấm vào team để mở / đóng danh sách. Bấm vào tên để mở hồ sơ. Thêm / gỡ ở đây tự đồng bộ với tab Danh sách.
      </div>

      <div style={{ textAlign: "center", margin: "6px 0 4px" }}>
        {ceo ? (
          <Link href={`/admin/employees/${ceo.id}`} className="card" style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 18px" }}>
            <Avatar id={ceo.id} name={ceo.name} photoUpdatedAt={ceo.photo?.updatedAt} size={32} />
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
                  {t.members.length} người ·{" "}
                  {(t.displayLeader ?? t.leader) ? (
                    `Leader: ${(t.displayLeader ?? t.leader)!.name}`
                  ) : (
                    <span className="missing">Chưa có Leader</span>
                  )}
                </div>
              </div>
              <span className="chev">▸</span>
            </summary>
            <div className="team-body">
              {t.members.length === 0 && <div style={{ fontSize: 12, color: "var(--text-3)", padding: "4px 0" }}>Chưa có ai</div>}
              {t.members.map((m) => (
                <div key={m.id} className="member-row">
                  <Avatar id={m.id} name={m.name} photoUpdatedAt={m.photo?.updatedAt} size={24} />
                  <Link href={`/admin/employees/${m.id}`}>
                    {m.name}
                    {(t.displayLeader ?? t.leader)?.id === m.id && <> <span className="badge warn xs">Leader</span></>}
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
              <AddExistingToTeamForm
                teamId={t.id}
                teamName={t.name}
                candidates={people.filter((p) => !t.members.some((m) => m.id === p.id))}
              />
              <TeamEditor
                team={{ id: t.id, name: t.name, type: t.type, memberCount: t.members.length, displayLeaderId: t.displayLeaderId }}
                teamMembers={t.members}
                otherPeople={people.filter((p) => !t.members.some((m) => m.id === p.id))}
              />
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
                  <Avatar id={m.id} name={m.name} photoUpdatedAt={m.photo?.updatedAt} size={24} />
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
