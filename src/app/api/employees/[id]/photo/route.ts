import { withAuth } from "@/lib/auth/api";
import { prisma } from "@/lib/db";

// Ảnh nhân sự: chỉ chính người đó hoặc Admin xem được (ảnh khuôn mặt là dữ liệu nhạy cảm).
export const GET = withAuth<RouteContext<"/api/employees/[id]/photo">>(async (_req, { params, user }) => {
  const { id } = await params;
  if (user.id !== id && user.role !== "ADMIN") {
    return Response.json({ error: "Không có quyền" }, { status: 403 });
  }
  const photo = await prisma.employeePhoto.findUnique({ where: { employeeId: id } });
  if (!photo) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      // URL có ?v=<thời điểm cập nhật> nên cache được; "private" = không cho proxy / CDN lưu
      "Cache-Control": "private, max-age=86400",
    },
  });
});
