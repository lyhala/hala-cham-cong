import "server-only";

import { NextResponse } from "next/server";
import type { Role } from "@/generated/prisma/enums";
import { getCurrentUser, type CurrentUser } from "./session";

type Handler<Ctx> = (req: Request, ctx: Ctx & { user: CurrentUser }) => Promise<Response> | Response;

/**
 * Bọc API (Route Handler): kiểm tra đăng nhập + role ngay trên server (spec §15).
 * Gọi thẳng API mà không qua giao diện cũng bị chặn.
 *
 *   export const GET = withAuth(async (req, { user }) => {...}, { roles: ["ADMIN"] })
 */
export function withAuth<Ctx extends object>(handler: Handler<Ctx>, options: { roles?: Role[] } = {}) {
  return async (req: Request, ctx: Ctx) => {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    if (user.mustChangePassword) {
      return NextResponse.json({ error: "Cần đổi mật khẩu trước khi sử dụng" }, { status: 403 });
    }
    if (options.roles && !options.roles.includes(user.role)) {
      return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
    }
    return handler(req, { ...ctx, user });
  };
}
