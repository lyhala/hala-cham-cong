"use client";

import { useActionState } from "react";
import { savePayrollSheetUrl } from "../actions";

// Ô nhập link file Google Sheet Bảng lương cố định (spec §9: 1 file, mỗi tháng thêm 1 tab).
export function SheetUrlForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState(savePayrollSheetUrl, undefined);
  return (
    <form action={action} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input
        name="url"
        defaultValue={current ?? ""}
        placeholder="Dán link file Google Sheet Bảng lương"
        style={{ flex: 1, minWidth: 220, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface)" }}
      />
      <button className="btn sm" type="submit" disabled={pending}>{pending ? "Đang lưu..." : "Lưu link"}</button>
      {state?.error && <div className="warn-box" style={{ width: "100%", margin: 0 }}>{state.error}</div>}
      {state?.ok && <div className="ok-box" style={{ width: "100%", margin: 0 }}>{state.message}</div>}
    </form>
  );
}
