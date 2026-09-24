import { ComingSoon } from "@/components/ComingSoon";
import { requireRole } from "@/lib/auth/session";

export default async function Page() {
  await requireRole("ADMIN");
  return (
    <ComingSoon
      title="Chấm công toàn công ty"
      subtitle="Xem và sửa trực tiếp"
      features={["Bảng công theo ngày/tháng của mọi nhân sự", "Sửa công trực tiếp (ghi nhật ký)"]}
    />
  );
}
