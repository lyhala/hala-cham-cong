import { ComingSoon } from "@/components/ComingSoon";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole("LEADER");
  return (
    <ComingSoon
      title="Dự án"
      subtitle="Dự án team mình in-charge"
      features={["Xem dự án", "Thêm/sửa dự án team mình in-charge"]}
    />
  );
}
