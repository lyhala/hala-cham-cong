import type { Role } from "@/generated/prisma/enums";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Hiện trên bottom nav điện thoại (tối đa 6 mục). Mục còn lại chỉ ở sidebar máy tính. */
  mobile?: boolean;
};

export type NavGroup = { label?: string; items: NavItem[] };

// Menu theo role — bám theo demo.html và spec §11.
const MY_ITEMS: NavItem[] = [
  { href: "/home", label: "Trang chủ", icon: "🏠", mobile: true },
  { href: "/attendance", label: "Chấm công", icon: "🕘", mobile: true },
  { href: "/requests", label: "Đơn từ", icon: "📝", mobile: true },
  { href: "/salary", label: "Lương", icon: "💰", mobile: true },
];

export const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  EMPLOYEE: [{ items: MY_ITEMS }],
  LEADER: [
    {
      items: [
        ...MY_ITEMS,
        { href: "/team", label: "Team", icon: "👥", mobile: true },
        { href: "/my-projects", label: "Dự án", icon: "📁", mobile: true },
      ],
    },
  ],
  ADMIN: [
    {
      label: "Quản lý",
      items: [
        { href: "/admin", label: "Home", icon: "🏠", mobile: true },
        { href: "/admin/employees", label: "Nhân sự", icon: "👥", mobile: true },
        { href: "/admin/attendance", label: "Chấm công", icon: "🕘" },
        { href: "/admin/approvals", label: "Duyệt đơn", icon: "✅", mobile: true },
        { href: "/admin/payroll", label: "Lương", icon: "💰", mobile: true },
        { href: "/admin/projects", label: "Dự án", icon: "📁", mobile: true },
        { href: "/admin/stats", label: "Thống kê", icon: "📊" },
        { href: "/admin/config", label: "Cấu hình", icon: "⚙️", mobile: true },
      ],
    },
    {
      label: "Của tôi",
      items: [
        { href: "/attendance", label: "Chấm công của tôi", icon: "🕘" },
        { href: "/requests", label: "Đơn từ của tôi", icon: "📝" },
        { href: "/salary", label: "Lương của tôi", icon: "💰" },
      ],
    },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  EMPLOYEE: "Nhân viên",
  LEADER: "Leader",
  ADMIN: "Admin",
};
