import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import type { EmployeeStatus, Role } from "@/generated/prisma/enums";

export const SESSION_COOKIE = "hala_session";
const SESSION_DAYS = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(employeeId: string, userAgent?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { id: hashToken(token), employeeId, expiresAt, userAgent: userAgent?.slice(0, 300) },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  cookieStore.delete(SESSION_COOKIE);
}

/** Xóa mọi phiên khác của nhân sự (VD sau khi đổi mật khẩu), giữ lại phiên hiện tại. */
export async function deleteOtherSessions(employeeId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await prisma.session.deleteMany({
    where: { employeeId, ...(token ? { NOT: { id: hashToken(token) } } : {}) },
  });
}

export type CurrentUser = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  role: Role;
  status: EmployeeStatus;
  teamId: string | null;
  teamName: string | null;
  mustChangePassword: boolean;
};

/**
 * Người đang đăng nhập, đọc từ DB mỗi request (cache trong 1 request).
 * Trả null nếu chưa đăng nhập, phiên hết hạn, tài khoản bị khóa / chưa có role.
 *
 * Nhân sự ĐÃ NGHỈ vẫn đăng nhập được (chưa bị khóa) — chỉ để xem phiếu lương cuối, không thao tác
 * gì khác. Quyền hạn cũ (Employee/Leader/Admin) không còn hiệu lực; requireUser() ép về /salary.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: { employee: { include: { team: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;

  const e = session.employee;
  if (e.isLocked || !e.role) return null;

  return {
    id: e.id,
    code: e.code,
    name: e.name,
    email: e.email,
    role: e.role,
    status: e.status,
    teamId: e.teamId,
    teamName: e.team?.name ?? null,
    mustChangePassword: e.mustChangePassword,
  };
});

async function currentPathname() {
  return (await headers()).get("x-pathname") ?? "";
}

/** Đường dẫn duy nhất nhân sự đã nghỉ được vào (xem phiếu lương cuối). */
const RESIGNED_ALLOWED_PATH = "/salary";

/**
 * Dùng trong trang (Server Component): chưa đăng nhập → về /login; chưa đổi mật khẩu lần đầu →
 * /change-password; đã nghỉ mà không đứng ở trang Lương → ép về /salary (mọi role cũ đều vậy).
 */
export async function requireUser(options: { allowMustChangePassword?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !options.allowMustChangePassword) redirect("/change-password");
  if (user.status === "RESIGNED") {
    const pathname = await currentPathname();
    if (pathname !== RESIGNED_ALLOWED_PATH && !pathname.startsWith(RESIGNED_ALLOWED_PATH + "/")) {
      redirect(RESIGNED_ALLOWED_PATH);
    }
  }
  return user;
}

/** Dùng trong trang: sai role → về trang chủ của role đó. Đã nghỉ thì requireUser() ép về /salary trước khi tới đây. */
export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(homePathFor(user));
  return user;
}

/** Trang chủ theo role — riêng nhân sự đã nghỉ thì luôn là /salary, dù role cũ là gì. */
export function homePathFor(user: { role: Role; status?: EmployeeStatus }) {
  if (user.status === "RESIGNED") return RESIGNED_ALLOWED_PATH;
  return user.role === "ADMIN" ? "/admin" : "/home";
}
