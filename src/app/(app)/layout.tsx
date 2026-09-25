import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { BottomNav, Sidebar } from "@/components/AppNav";
import { Brand } from "@/components/Brand";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { NAV_BY_ROLE, RESIGNED_NAV, ROLE_LABEL } from "@/lib/nav";
import { getSetting } from "@/lib/settings-db";
import { initials } from "@/lib/format";

// Khung chung cho mọi trang sau khi đăng nhập: topbar + sidebar (máy tính) + bottom nav (điện thoại).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const resigned = user.status === "RESIGNED";
  const groups = resigned ? RESIGNED_NAV : NAV_BY_ROLE[user.role];
  const [unread, appearance] = await Promise.all([
    resigned ? 0 : prisma.notification.count({ where: { employeeId: user.id, readAt: null } }),
    getSetting("appearance"),
  ]);

  return (
    <div style={{ ["--header-color" as string]: appearance.headerColor }}>
      <header className="topbar">
        <Link href="/">
          <Brand />
        </Link>
        <div className="topbar-right">
          <div className="topbar-user">
            <div className="name">{user.name}</div>
            <div className="role">
              {resigned ? "Đã nghỉ việc" : ROLE_LABEL[user.role]}
              {!resigned && user.teamName ? ` · ${user.teamName}` : ""}
            </div>
          </div>
          {!resigned && (
            <Link href="/notifications" className="bell-btn" title="Thông báo" aria-label="Thông báo">
              🔔{unread > 0 && <span className="bell-badge">{unread > 99 ? "99+" : unread}</span>}
            </Link>
          )}
          {resigned ? (
            <div className="avatar-btn" title="Hồ sơ cá nhân" aria-label="Hồ sơ cá nhân">
              {initials(user.name)}
            </div>
          ) : (
            <Link href="/profile" className="avatar-btn" title="Hồ sơ cá nhân" aria-label="Hồ sơ cá nhân">
              {initials(user.name)}
            </Link>
          )}
        </div>
      </header>

      {resigned && (
        <div className="info-box" style={{ margin: "14px 16px 0", borderRadius: 10 }}>
          Tài khoản của bạn đã nghỉ việc. Bạn chỉ xem được Lương ở đây; các mục khác không còn dùng được.
        </div>
      )}

      <div className="shell">
        <Sidebar
          groups={groups}
          footer={
            <form action={logout}>
              <button type="submit">🚪 Đăng xuất</button>
            </form>
          }
        />
        <main className="content">{children}</main>
      </div>
      <BottomNav
        groups={groups}
        moreFooter={
          <>
            {!resigned && <Link href="/profile" className="btn">👤 Hồ sơ</Link>}
            <form action={logout}>
              <button type="submit" className="btn danger">Đăng xuất</button>
            </form>
          </>
        }
      />
    </div>
  );
}
