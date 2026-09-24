import { ComingSoon } from "@/components/ComingSoon";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole("ADMIN");
  return (
    <ComingSoon
      title="Lương"
      subtitle="Lương & Thưởng toàn công ty"
      features={["Tính / Tính lại / Gửi / Gửi lại phiếu lương", "Xuất Sheet, sync BHXH – Thuế", "Tab Thưởng: tạo thưởng, gắn dự án"]}
    />
  );
}
