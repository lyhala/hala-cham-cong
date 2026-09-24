import { ComingSoon } from "@/components/ComingSoon";
import { requireUser } from "@/lib/auth/session";

export default async function Page() {
  await requireUser();
  return (
    <ComingSoon
      title="Lương"
      subtitle="Phiếu lương & thưởng"
      features={["Tab Lương: phiếu lương từng tháng", "Tab Thưởng: các khoản thưởng đã nhận"]}
    />
  );
}
