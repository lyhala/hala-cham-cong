"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { hashPassword, validateNewPassword, verifyPassword } from "@/lib/auth/password";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/auth/rate-limit";
import {
  createSession,
  deleteCurrentSession,
  deleteOtherSessions,
  getCurrentUser,
  homePathFor,
} from "@/lib/auth/session";

export type FormState = { error?: string } | undefined;

// Hash giả để so sánh khi email không tồn tại → thời gian phản hồi như nhau, không lộ email nào có thật.
const DUMMY_HASH = "$2b$10$wPRr9bEc6BJercdHOrCX3e.uH5bGFKyxLNsn8lS5Rlj6ZUGMekTvK";

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Vui lòng nhập email và mật khẩu." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limitKey = `${email}|${ip}`;
  if (isRateLimited(limitKey)) {
    return { error: "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút." };
  }

  const employee = await prisma.employee.findUnique({ where: { email } });
  const ok = await verifyPassword(password, employee?.passwordHash ?? DUMMY_HASH);

  if (!employee || !employee.passwordHash || !ok) {
    recordFailure(limitKey);
    return { error: "Email hoặc mật khẩu không đúng." };
  }
  if (employee.isLocked) {
    return { error: "Tài khoản đã bị khóa. Vui lòng liên hệ Admin." };
  }
  const role = employee.role;
  if (!role) {
    return { error: "Tài khoản chưa được phân quyền (Role). Vui lòng liên hệ Admin." };
  }
  // Nhân sự đã nghỉ (chưa bị khóa) vẫn đăng nhập được — chỉ để xem phiếu lương cuối,
  // requireUser() sẽ tự ép về /salary, mọi quyền cũ hết hiệu lực ngay.

  clearFailures(limitKey);
  await createSession(employee.id, h.get("user-agent"));
  await prisma.employee.update({ where: { id: employee.id }, data: { lastLoginAt: new Date() } });

  redirect(employee.mustChangePassword ? "/change-password" : homePathFor({ role, status: employee.status }));
}

export async function logout() {
  await deleteCurrentSession();
  redirect("/login");
}

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: user.id } });
  if (!employee.passwordHash || !(await verifyPassword(current, employee.passwordHash))) {
    return { error: "Mật khẩu hiện tại không đúng." };
  }
  const invalid = validateNewPassword(next);
  if (invalid) return { error: invalid };
  if (next !== confirm) return { error: "Mật khẩu nhập lại không khớp." };
  if (next === current) return { error: "Mật khẩu mới phải khác mật khẩu hiện tại." };

  await prisma.employee.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  await deleteOtherSessions(user.id);
  await logAudit({ actorId: user.id, action: "auth.change_password", summary: `${user.name} đổi mật khẩu` });

  redirect(homePathFor(user));
}
