import { redirect } from "next/navigation";

// "Duyệt đơn" đã gộp vào màn Đơn từ (tab Duyệt đơn) — giữ đường dẫn cũ để không lỗi link.
export default function ApprovalsRedirect() {
  redirect("/requests?tab=approve");
}
