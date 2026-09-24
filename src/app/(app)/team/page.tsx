import { ComingSoon } from "@/components/ComingSoon";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole("LEADER");
  return (
    <ComingSoon
      title="Team của tôi"
      subtitle="Danh sách và trạng thái nhanh"
      features={["Danh sách thành viên team", "Trạng thái chấm công hôm nay"]}
    />
  );
}
