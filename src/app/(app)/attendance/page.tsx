import { ComingSoon } from "@/components/ComingSoon";
import { requireUser } from "@/lib/auth/session";

export default async function Page() {
  await requireUser();
  return (
    <ComingSoon
      title="Chấm công"
      subtitle="Công của tôi theo tháng"
      features={["Lịch tháng: đủ công / đi muộn / nghỉ", "Hôm nay: giờ check-in và check-out từ camera Hanet", "Chi tiết từng ngày: số công, phút muộn, tiền phạt"]}
    />
  );
}
