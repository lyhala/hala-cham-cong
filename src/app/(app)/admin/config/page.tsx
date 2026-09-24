import { ComingSoon } from "@/components/ComingSoon";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole("ADMIN");
  return (
    <ComingSoon
      title="Cấu hình"
      subtitle=""
      features={["Lịch làm việc, bảng phạt đi muộn, tham số lương", "Tiêu chí performance, duyệt đơn theo loại", "Quyền theo role, Google Sheets, Giao diện"]}
    />
  );
}
