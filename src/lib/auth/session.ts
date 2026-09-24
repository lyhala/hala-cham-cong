import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

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
  teamId: string | null;
  teamName: string | null;
  mustChangePassword: boolean;
};

/**
 * Người đang đăng nhập, đọc từ DB mỗi request (cache trong 1 request).
 * Trả null nếu chưa đăng nhập, phiên hết hạn, tài khoản bị khóa / đã nghỉ / chưa có role.
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
  if (e.isLocked || e.status !== "ACTIVE" || !e.role) return null;

  return {
    id: e.id,
    code: e.code,
    name: e.name,
    email: e.email,
    role: e.role,
    teamId: e.teamId,
    teamName: e.team?.name ?? null,
    mustChangePassword: e.mustChangePassword,
  };
});

/** Dùng trong trang (Server Component): chưa đăng nhập → về /login; chưa đổi mật khẩu lần đầu → /change-password. */
export async function requireUser(options: { allowMustChangePassword?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !options.allowMustChangePassword) redirect("/change-password");
  return user;
}

/** Dùng trong trang: sai role → về trang chủ của role đó. */
export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(homePathFor(user.role));
  return user;
}

export function homePathFor(role: Role) {
  return role === "ADMIN" ? "/admin" : "/home";
}
