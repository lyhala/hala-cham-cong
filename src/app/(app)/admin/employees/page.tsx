import { ComingSoon } from "@/components/ComingSoon";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole("ADMIN");
  return (
    <ComingSoon
      title="Nhân sự"
      subtitle="Danh sách & Sơ đồ tổ chức"
      features={["Danh sách: thêm/sửa/khóa, sync Google Sheet, lịch sử lương", "Upload ảnh FaceID → tự đăng ký Hanet", "Sơ đồ tổ chức: CEO → Team → Nhân sự"]}
    />
  );
}
