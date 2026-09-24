import { ComingSoon } from "@/components/ComingSoon";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole("ADMIN");
  return (
    <ComingSoon
      title="Duyệt đơn"
      subtitle="Toàn quyền duyệt / từ chối / xóa"
      features={["Danh sách đơn chờ duyệt toàn công ty", "Cảnh báo vượt 3 lần miễn phạt đi muộn", "Xóa đơn đã duyệt → tự revert công"]}
    />
  );
}
