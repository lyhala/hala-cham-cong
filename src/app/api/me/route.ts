import { withAuth } from "@/lib/auth/api";

// Thông tin người đang đăng nhập. Mẫu cho mọi API sau này: luôn bọc bằng withAuth.
export const GET = withAuth(async (_req, { user }) => {
  return Response.json({ id: user.id, name: user.name, email: user.email, role: user.role, team: user.teamName });
});
