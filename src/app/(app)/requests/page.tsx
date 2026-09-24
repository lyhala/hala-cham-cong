import { ComingSoon } from "@/components/ComingSoon";
import { requireUser } from "@/lib/auth/session";

export default async function Page() {
  await requireUser();
  return (
    <ComingSoon
      title="Đơn từ"
      subtitle="Tạo, theo dõi và thu hồi đơn"
      features={["Tạo đơn: OT, Đi muộn, Về sớm, Nghỉ, WFH, Tạm ứng lương", "Danh sách đơn của tôi + thu hồi đơn đang chờ", "Leader: tab Duyệt đơn của team"]}
    />
  );
}
