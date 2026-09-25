import { ActionButton } from "../../employees/_components/ActionButton";
import { deleteBonusAction } from "../actions";
import { BonusForm } from "./BonusForm";

type Entry = { id: string; units: number; note: string; createdBy: { name: string } | null };

/** Ô "Công bù" của 1 dòng bảng lương: bấm mở danh sách các khoản đã bù + form thêm khoản mới. */
export function BonusCell({ employeeId, month, entries }: { employeeId: string; month: string; entries: Entry[] }) {
  const total = Math.round(entries.reduce((s, e) => s + e.units, 0) * 100) / 100;
  return (
    <details>
      <summary style={{ cursor: "pointer", listStyle: "none", textAlign: "right", whiteSpace: "nowrap" }}>
        {total > 0 ? <b style={{ color: "var(--success)" }}>+{total}</b> : <span style={{ color: "var(--text-3)" }}>＋ Bù</span>}
      </summary>
      <div className="card" style={{ marginTop: 6, width: 260, whiteSpace: "normal", textAlign: "left" }}>
        <div className="section-title" style={{ marginTop: 0 }}>Công bù tháng {month}</div>
        {entries.length === 0 && <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>Chưa có khoản công bù nào.</div>}
        {entries.map((e) => (
          <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, fontSize: 12.5, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <b>+{e.units} công</b> <span style={{ color: "var(--text-2)" }}>{e.note}</span>
              {e.createdBy && <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>bởi {e.createdBy.name}</div>}
            </div>
            <ActionButton action={deleteBonusAction} fields={{ id: e.id }} label="✕" className="icon-btn" title="Xóa khoản công bù" confirm={`Xóa khoản công bù ${e.units} công?`} showResult={false} />
          </div>
        ))}
        <div style={{ marginTop: 10 }}>
          <BonusForm employeeId={employeeId} month={month} />
        </div>
      </div>
    </details>
  );
}
