import type { Role } from "@/generated/prisma/enums";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Tên ngắn trên thanh menu dưới của điện thoại (mặc định = label) */
  mobileLabel?: string;
  /** Hiện trên thanh menu dưới điện thoại. Mục còn lại nằm trong nút "☰ Thêm". */
  mobile?: boolean;
};

export type NavGroup = { label?: string; items: NavItem[] };

// Menu theo role — bám theo demo.html và spec §11.
// Máy tính: sidebar hiện đủ mọi mục. Điện thoại: thanh dưới chỉ hiện mục có mobile: true
// (tối đa ~5–6 mục cho dễ bấm), phần còn lại gom vào "☰ Thêm".
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
  // Admin: điện thoại ưu tiên việc cá nhân (xem công, đơn, phiếu lương của mình);
  // việc quản lý nặng (làm lương, thống kê, cấu hình) chủ yếu làm trên máy tính → nằm trong "☰ Thêm".
  ADMIN: [
    {
      label: "Quản lý",
      items: [
        { href: "/admin", label: "Home", icon: "🏠", mobile: true },
        { href: "/admin/employees", label: "Nhân sự", icon: "👥" },
        { href: "/admin/attendance", label: "Chấm công toàn công ty", icon: "🗓️" },
        { href: "/admin/payroll", label: "Bảng lương", icon: "🧾" },
        { href: "/admin/projects", label: "Dự án", icon: "📁" },
        { href: "/admin/stats", label: "Thống kê", icon: "📊" },
        { href: "/admin/config", label: "Cấu hình", icon: "⚙️" },
      ],
    },
    {
      label: "Của tôi",
      items: [
        { href: "/attendance", label: "Chấm công của tôi", mobileLabel: "Chấm công", icon: "🕘", mobile: true },
        { href: "/requests", label: "Đơn từ & duyệt đơn", mobileLabel: "Đơn từ", icon: "📝", mobile: true },
        { href: "/salary", label: "Lương của tôi", mobileLabel: "Lương", icon: "💰", mobile: true },
      ],
    },
  ],
};

// Menu cho nhân sự ĐÃ NGHỈ (bất kể role cũ là gì) — chỉ còn xem phiếu lương cuối.
export const RESIGNED_NAV: NavGroup[] = [
  { items: [{ href: "/salary", label: "Lương", icon: "💰", mobile: true }] },
];

export const ROLE_LABEL: Record<Role, string> = {
  EMPLOYEE: "Nhân viên",
  LEADER: "Leader",
  ADMIN: "Admin",
};
