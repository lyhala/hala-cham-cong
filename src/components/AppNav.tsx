"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "@/lib/nav";

function isActive(pathname: string, href: string) {
  // "/admin" chỉ active đúng trang đó, không active khi đang ở "/admin/employees"
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ groups, footer }: { groups: NavGroup[]; footer?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <nav className="sidebar" aria-label="Menu chính">
      {groups.map((group, i) => (
        <div key={i}>
          {i > 0 && <div className="divider" />}
          {group.label && <div className="group-label">{group.label}</div>}
          {group.items.map((it) => (
            <Link key={it.href} href={it.href} className={isActive(pathname, it.href) ? "active" : ""}>
              <span>{it.icon}</span> {it.label}
            </Link>
          ))}
        </div>
      ))}
      <div className="spacer" />
      {footer}
    </nav>
  );
}

export function BottomNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const items = groups.flatMap((g) => g.items).filter((it) => it.mobile);
  return (
    <nav className="bottomnav" aria-label="Menu chính">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={isActive(pathname, it.href) ? "active" : ""}>
          <span className="ic">{it.icon}</span>
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}
