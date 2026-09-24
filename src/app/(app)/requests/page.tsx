import Link from "next/link";
import { ComingSoon } from "@/components/ComingSoon";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

// Đơn từ: tab "Đơn của tôi" (mọi role) + tab "Duyệt đơn" (Leader: đơn của team; Admin: toàn công ty).
export default async function RequestsPage(props: PageProps<"/requests">) {
  const user = await requireUser();
  const canApprove = user.role === "LEADER" || user.role === "ADMIN";
  const sp = await props.searchParams;
  const tab = canApprove && sp.tab === "approve" ? "approve" : "mine";

  const pendingToApprove = canApprove
    ? await prisma.request.count({
        where: {
          status: user.role === "ADMIN" ? { in: ["PENDING", "LEADER_APPROVED"] } : "PENDING",
          deletedAt: null,
          employeeId: { not: user.id },
          ...(user.role === "LEADER" ? { employee: { teamId: user.teamId ?? "__none__" } } : {}),
        },
      })
    : 0;

  return (
    <>
      {canApprove && (
        <div className="tabs">
          <Link className={`btn sm ${tab === "mine" ? "primary" : ""}`} href="/requests">Đơn của tôi</Link>
          <Link className={`btn sm ${tab === "approve" ? "primary" : ""}`} href="/requests?tab=approve">
            Duyệt đơn{pendingToApprove > 0 && <span className="badge warn xs" style={{ marginLeft: 6 }}>{pendingToApprove}</span>}
          </Link>
        </div>
      )}
      {tab === "mine" ? (
        <ComingSoon
          title="Đơn của tôi"
          subtitle="Tạo, theo dõi và thu hồi đơn"
          features={[
            "Tạo đơn: OT, Đi muộn, Về sớm, Nghỉ, WFH, Tạm ứng lương",
            "Danh sách đơn đã gửi + trạng thái duyệt",
            "Thu hồi đơn đang chờ duyệt",
          ]}
        />
      ) : (
        <ComingSoon
          title="Duyệt đơn"
          subtitle={user.role === "ADMIN" ? "Toàn công ty — toàn quyền duyệt / từ chối / xóa" : "Đơn của team bạn"}
          features={[
            "Danh sách đơn chờ duyệt, duyệt / từ chối",
            "Cảnh báo vượt 3 lần miễn phạt đi muộn",
            user.role === "ADMIN" ? "Xóa mọi đơn (kể cả đã duyệt) → tự revert công" : "Xóa đơn của team → tự revert công",
          ]}
        />
      )}
    </>
  );
}
