import type { DayPortion, LeaveSubtype, RequestStatus, RequestType } from "@/generated/prisma/enums";
import { dateTimeVN } from "@/lib/dates";
import { fmtDate, fmtMoney } from "@/lib/format";
import { hoursBetween, LEAVE_LABEL, PORTION_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/requests";

export type CardRequest = {
  type: RequestType;
  leaveSubtype: LeaveSubtype | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  dayPortion: DayPortion | null;
  timeFrom: string | null;
  timeTo: string | null;
  amount: number | null;
  reason: string;
  status: RequestStatus;
  createdAt: Date;
  rejectReason: string | null;
  approvedBy?: { name: string } | null;
  leaderApprovedBy?: { name: string } | null;
  rejectedBy?: { name: string } | null;
};

const STATUS_BADGE: Record<RequestStatus, string> = { PENDING: "warn", LEADER_APPROVED: "warn", APPROVED: "ok", REJECTED: "danger", WITHDRAWN: "neutral" };

/** Thẻ hiển thị 1 đơn: loại (badge), ngày áp dụng, thời gian áp dụng, lý do (khối riêng), trạng thái (spec §5). */
export function RequestCard({ r, owner, warning, children }: { r: CardRequest; owner?: { name: string; code: string; team: string | null }; warning?: string | null; children?: React.ReactNode }) {
  const dateText =
    r.dateFrom && r.dateTo && r.dateFrom.getTime() !== r.dateTo.getTime() ? `${fmtDate(r.dateFrom)} → ${fmtDate(r.dateTo)}` : r.dateFrom ? fmtDate(r.dateFrom) : null;
  const timeText = r.timeFrom && r.timeTo ? `${r.timeFrom} – ${r.timeTo}${r.type === "OT" ? ` (${hoursBetween(r.timeFrom, r.timeTo)} giờ)` : ""}` : null;
  const portion = r.dayPortion && r.dayPortion !== "FULL" ? PORTION_LABEL[r.dayPortion] : r.dayPortion === "FULL" ? "Cả ngày" : null;

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <span className="badge neutral">{TYPE_LABEL[r.type]}{r.leaveSubtype ? ` · ${LEAVE_LABEL[r.leaveSubtype]}` : ""}</span>
          {owner && (
            <span style={{ marginLeft: 8, fontWeight: 600, fontSize: 13 }}>
              {owner.name} <span style={{ color: "var(--text-3)", fontWeight: 400, fontSize: 11.5 }}>{owner.code}{owner.team ? ` · ${owner.team}` : ""}</span>
            </span>
          )}
        </div>
        <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
      </div>

      <div className="grid3" style={{ marginBottom: 8 }}>
        {dateText && <div><div className="stat-label">Ngày áp dụng</div><b style={{ fontSize: 13 }}>{dateText}</b></div>}
        {(timeText || portion) && <div><div className="stat-label">Thời gian áp dụng</div><b style={{ fontSize: 13 }}>{timeText ?? portion}</b></div>}
        {r.amount != null && <div><div className="stat-label">Số tiền</div><b style={{ fontSize: 13 }}>{fmtMoney(r.amount)}đ</b></div>}
      </div>

      <div style={{ background: "var(--bg)", borderRadius: 9, padding: "9px 11px", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
        <div className="stat-label" style={{ marginBottom: 2 }}>Lý do</div>
        {r.reason}
      </div>

      {warning && <div className="warn-box" style={{ marginTop: 8, marginBottom: 0 }}>{warning}</div>}

      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8 }}>
        Gửi lúc {dateTimeVN(r.createdAt)}
        {r.leaderApprovedBy && r.status !== "APPROVED" && ` · Leader ${r.leaderApprovedBy.name} đã duyệt`}
        {r.status === "APPROVED" && (r.approvedBy || r.leaderApprovedBy) && ` · Duyệt bởi ${(r.approvedBy ?? r.leaderApprovedBy)!.name}`}
        {r.status === "REJECTED" && r.rejectedBy && ` · Từ chối bởi ${r.rejectedBy.name}`}
      </div>
      {r.status === "REJECTED" && r.rejectReason && <div style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 4 }}>Lý do từ chối: {r.rejectReason}</div>}
      {children && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start", marginTop: 10 }}>{children}</div>}
    </div>
  );
}
