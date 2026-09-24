import { ComingSoon } from "@/components/ComingSoon";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole("ADMIN");
  return (
    <ComingSoon
      title="Thống kê"
      subtitle=""
      features={["Top đi sớm / đi muộn", "Báo cáo lịch sử lương toàn công ty"]}
    />
  );
}
