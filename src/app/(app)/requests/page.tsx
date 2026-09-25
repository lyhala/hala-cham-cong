import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { todayVN } from "@/lib/dates";
import { annualLeaveBalance, countToApprove, lateWarning, listMyRequests, listProcessed, listToApprove } from "@/lib/requests-db";
import { getSetting } from "@/lib/settings-db";
import { ActionButton } from "../admin/employees/_components/ActionButton";
import { approveRequestAction, deleteRequestAction, withdrawRequestAction } from "./actions";
import { CreateRequestForm } from "./_components/CreateRequestForm";
import { RejectForm } from "./_components/RejectForm";
import { RequestCard } from "./_components/RequestCard";

// Đơn từ: tab "Đơn của tôi" (mọi role) + tab "Duyệt đơn" (Leader: đơn của team; Admin: toàn công ty).
export default async function RequestsPage(props: PageProps<"/requests">) {
  const user = await requireUser();
  const canApprove = user.role === "LEADER" || user.role === "ADMIN";
  const sp = await props.searchParams;
  const tab = canApprove && sp.tab === "approve" ? "approve" : "mine";
  const pendingToApprove = canApprove ? await countToApprove(user) : 0;

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
      {tab === "mine" ? <MyRequests userId={user.id} isAdmin={user.role === "ADMIN"} /> : <Approvals user={user} />}
    </>
  );
}

async function MyRequests({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [requests, perms, leave] = await Promise.all([listMyRequests(userId), getSetting("rolePermissions"), annualLeaveBalance(userId, Number(todayVN().slice(0, 4)))]);
  // Admin bật/tắt nút chức năng theo role (§2)
  const types = (["OT", "LATE", "EARLY_LEAVE", "LEAVE", ...(isAdmin || perms.employee.wfh ? ["WFH"] : []), ...(isAdmin || perms.employee.advance ? ["SALARY_ADVANCE"] : [])]) as ("OT" | "LATE" | "EARLY_LEAVE" | "LEAVE" | "WFH" | "SALARY_ADVANCE")[];

  return (
    <>
      <h1>Đơn của tôi</h1>
      <div className="subtitle">Tạo, theo dõi và thu hồi đơn</div>
      <div className="info-box">
        Phép năm {leave.year}: còn <b>{leave.remaining}</b> ngày (tích lũy {leave.accrued} đến hết tháng {leave.uptoMonth}
        {leave.adjustment !== 0 && <>, Admin điều chỉnh {leave.adjustment > 0 ? "+" : ""}{leave.adjustment}</>}
        {leave.used > 0 && <>, đã nghỉ {leave.used}</>}
        {leave.pending > 0 && <>, chờ duyệt {leave.pending}</>})
        {leave.eligibleFrom > `${leave.year}-${String(leave.uptoMonth).padStart(2, "0")}` && <> · đang thử việc, được tính phép từ tháng {leave.eligibleFrom.slice(5)}/{leave.eligibleFrom.slice(0, 4)}</>}
        <div style={{ fontSize: 11.5, marginTop: 2, opacity: 0.8 }}>Mỗi tháng được cộng phép, không dùng thì cộng dồn sang tháng sau; không nghỉ ứng trước; phép tồn cuối năm được quy đổi ra lương.</div>
      </div>
      <CreateRequestForm types={types} today={todayVN()} />
      {requests.length === 0 && <div className="card empty">Bạn chưa gửi đơn nào.</div>}
      {requests.map((r) => (
        <RequestCard key={r.id} r={r}>
          {(r.status === "PENDING" || r.status === "LEADER_APPROVED") && (
            <ActionButton action={withdrawRequestAction} fields={{ id: r.id }} label="Thu hồi" confirm="Thu hồi đơn này?" />
          )}
        </RequestCard>
      ))}
    </>
  );
}

async function Approvals({ user }: { user: { id: string; name: string; role: "EMPLOYEE" | "LEADER" | "ADMIN" } }) {
  const [pending, processed] = await Promise.all([listToApprove(user), listProcessed(user)]);
  // Cảnh báo cho Leader/Admin khi duyệt đơn đi muộn vượt số suất miễn phạt (chỉ tính đơn ĐÃ duyệt)
  const warnings = await Promise.all(pending.map((r) => (r.type === "LATE" ? lateWarning(r, false) : Promise.resolve(null))));
  const owner = (r: { employee: { name: string; code: string; team: { name: string } | null } }) => ({ name: r.employee.name, code: r.employee.code, team: r.employee.team?.name ?? null });

  return (
    <>
      <h1>Duyệt đơn</h1>
      <div className="subtitle">{user.role === "ADMIN" ? "Toàn công ty — toàn quyền duyệt / từ chối / xóa" : "Đơn của team bạn"}</div>

      <div className="section-title" style={{ marginTop: 0 }}>Chờ duyệt ({pending.length})</div>
      {pending.length === 0 && <div className="card empty">Không có đơn nào chờ duyệt.</div>}
      {pending.map((r, i) => (
        <RequestCard key={r.id} r={r} owner={owner(r)} warning={warnings[i]}>
          <ActionButton action={approveRequestAction} fields={{ id: r.id }} label={r.status === "LEADER_APPROVED" ? "Duyệt (Admin)" : "Duyệt"} className="btn sm primary" />
          <RejectForm id={r.id} />
          <ActionButton action={deleteRequestAction} fields={{ id: r.id }} label="Xóa" className="btn sm" confirm="Xóa đơn này?" />
        </RequestCard>
      ))}

      <div className="section-title">Đã xử lý 30 ngày gần đây</div>
      {processed.length === 0 && <div className="card empty">Chưa có đơn nào.</div>}
      {processed.map((r) => (
        <RequestCard key={r.id} r={r} owner={owner(r)}>
          <ActionButton
            action={deleteRequestAction}
            fields={{ id: r.id }}
            label="Xóa"
            className="btn sm"
            confirm={r.status === "APPROVED" ? "Xóa đơn ĐÃ DUYỆT? Phần công / miễn phạt đã áp dụng sẽ được hoàn lại." : "Xóa đơn này?"}
          />
        </RequestCard>
      ))}
    </>
  );
}
