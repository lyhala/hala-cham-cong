import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { BottomNav, Sidebar } from "@/components/AppNav";
import { Brand } from "@/components/Brand";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { NAV_BY_ROLE, ROLE_LABEL } from "@/lib/nav";
import { getSetting } from "@/lib/settings-db";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.at(-1)?.[0] ?? "?").toUpperCase();
}

// Khung chung cho mọi trang sau khi đăng nhập: topbar + sidebar (máy tính) + bottom nav (điện thoại).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const groups = NAV_BY_ROLE[user.role];
  const [unread, appearance] = await Promise.all([
    prisma.notification.count({ where: { employeeId: user.id, readAt: null } }),
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
            <div className="role">{ROLE_LABEL[user.role]}{user.teamName ? ` · ${user.teamName}` : ""}</div>
          </div>
          <Link href="/notifications" className="bell-btn" title="Thông báo" aria-label="Thông báo">
            🔔{unread > 0 && <span className="bell-badge">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <Link href="/profile" className="avatar-btn" title="Hồ sơ cá nhân" aria-label="Hồ sơ cá nhân">
            {initials(user.name)}
          </Link>
        </div>
      </header>

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
      <BottomNav groups={groups} />
    </div>
  );
}
