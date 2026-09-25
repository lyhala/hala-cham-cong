import { prisma } from "@/lib/db";
import { annualLeaveBalance } from "@/lib/requests-db";
import { deleteLeaveAdjustment } from "../actions";
import { ActionButton } from "./ActionButton";
import { LeaveAdjustForm } from "./LeaveAdjustForm";

/**
 * Thẻ "Phép năm" của 1 nhân sự trong 1 năm: tích lũy (gồm điều chỉnh của Admin), đã nghỉ, còn lại, phần sẽ quy đổi ra lương.
 * `closed` = năm vừa hết: phiếu lương tháng 12 của năm đó được tính vào đầu năm sau nên Admin còn điều chỉnh phép được.
 */
export async function LeaveYearCard({ employeeId, year, closed = false }: { employeeId: string; year: number; closed?: boolean }) {
  const [leave, adjustments] = await Promise.all([
    annualLeaveBalance(employeeId, year),
    prisma.leaveAdjustment.findMany({ where: { employeeId, year }, orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } }),
  ]);

  return (
    <>
      <div className="section-title" style={{ marginTop: 24 }}>
        Phép năm {year}
        {closed && <span className="badge warn xs" style={{ marginLeft: 8 }}>năm vừa chốt — quy đổi ở lương tháng 12/{year}</span>}
      </div>
      <div className="card">
        <div className="grid3" style={{ marginBottom: 12 }}>
          <div><div className="stat-label">Còn lại (phép tồn)</div><div className="stat-value" style={{ fontSize: 17 }}>{leave.remaining} ngày</div></div>
          <div><div className="stat-label">Đã tích lũy đến hết tháng {leave.uptoMonth}</div><div className="stat-value" style={{ fontSize: 17 }}>{leave.accrued}</div></div>
          <div><div className="stat-label">Đã nghỉ{leave.pending > 0 ? ` (+${leave.pending} chờ duyệt)` : ""}</div><div className="stat-value" style={{ fontSize: 17 }}>{leave.used}</div></div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12, lineHeight: 1.6 }}>
          Phép tích lũy từ tháng {leave.eligibleFrom.startsWith("0000") ? "đầu năm" : `${leave.eligibleFrom.slice(5)}/${leave.eligibleFrom.slice(0, 4)}`} (sau thử việc), không nghỉ ứng trước.
          Phép tồn cuối năm <b>{leave.toPayOut} ngày</b> sẽ được quy đổi ra tiền ở phiếu lương tháng 12/{year} (lương base ÷ ngày công tháng × số ngày tồn).
          {leave.adjustment !== 0 && <> Trong đó Admin đã điều chỉnh <b>{leave.adjustment > 0 ? "+" : ""}{leave.adjustment} ngày</b>.</>}
          {leave.pending > 0 && <> Còn {leave.pending} ngày đang chờ duyệt — duyệt xong mới tính là đã nghỉ.</>}
        </div>
        {adjustments.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 12, boxShadow: "none" }}>
            <table>
              <thead><tr><th>Ngày</th><th className="right">Số ngày</th><th>Lý do</th><th></th></tr></thead>
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{a.createdAt.toISOString().slice(0, 10).split("-").reverse().join("/")}</td>
                    <td className="right"><b style={{ color: a.days < 0 ? "var(--danger)" : "var(--success)" }}>{a.days > 0 ? "+" : ""}{a.days}</b></td>
                    <td style={{ fontSize: 12, color: "var(--text-2)" }}>{a.note}{a.createdBy && <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>bởi {a.createdBy.name}</div>}</td>
                    <td>
                      <ActionButton action={deleteLeaveAdjustment} fields={{ id: a.id }} label="✕" className="icon-btn" title="Xóa điều chỉnh" confirm={`Xóa điều chỉnh ${a.days > 0 ? "+" : ""}${a.days} ngày?`} showResult={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <LeaveAdjustForm employeeId={employeeId} year={year} />
      </div>
    </>
  );
}
