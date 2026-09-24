import { ComingSoon } from "@/components/ComingSoon";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole("ADMIN");
  return (
    <ComingSoon
      title="Dự án"
      subtitle="Danh sách · Chi phí cố định · Báo cáo"
      features={["Danh sách dự án (Active / Archived)", "Chi phí cố định theo tháng", "Báo cáo chi phí theo dự án và theo team"]}
    />
  );
}
