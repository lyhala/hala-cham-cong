"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavGroup, NavItem } from "@/lib/nav";

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

/**
 * Thanh menu dưới trên điện thoại. Mục có mobile: true hiện trực tiếp;
 * mục còn lại gom vào nút "☰ Thêm" (mở bảng trượt từ dưới lên).
 */
export function BottomNav({ groups, moreFooter }: { groups: NavGroup[]; moreFooter?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Đóng bảng "Thêm" khi chuyển trang
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const barItems = groups.flatMap((g) => g.items).filter((it) => it.mobile);
  const moreGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.mobile) }))
    .filter((g) => g.items.length > 0);
  const hasMore = moreGroups.length > 0;
  const moreActive = moreGroups.some((g) => g.items.some((it) => isActive(pathname, it.href)));

  return (
    <>
      <nav className="bottomnav" aria-label="Menu chính">
        {barItems.map((it: NavItem) => (
          <Link key={it.href} href={it.href} className={isActive(pathname, it.href) ? "active" : ""}>
            <span className="ic">{it.icon}</span>
            <span>{it.mobileLabel ?? it.label}</span>
          </Link>
        ))}
        {hasMore && (
          <button
            type="button"
            className={moreActive || open ? "active" : ""}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <span className="ic">☰</span>
            <span>Thêm</span>
          </button>
        )}
      </nav>

      {hasMore && open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-label="Menu thêm" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            {moreGroups.map((g, i) => (
              <div key={i}>
                {g.label && <div className="group-label">{g.label}</div>}
                <div className="sheet-grid">
                  {g.items.map((it) => (
                    <Link key={it.href} href={it.href} className={isActive(pathname, it.href) ? "active" : ""}>
                      <span className="ic">{it.icon}</span>
                      <span>{it.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {moreFooter && <div className="sheet-footer">{moreFooter}</div>}
          </div>
        </div>
      )}
    </>
  );
}
