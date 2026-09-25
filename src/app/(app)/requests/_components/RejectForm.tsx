"use client";

import { useActionState, useState } from "react";
import { rejectRequestAction } from "../actions";

// Nút "Từ chối" mở ô nhập lý do (bắt buộc) rồi mới gửi.
export function RejectForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(rejectRequestAction, undefined);

  if (!open) return <button type="button" className="btn sm danger" onClick={() => setOpen(true)}>Từ chối</button>;
  return (
    <form action={action} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", width: "100%" }}>
      <input type="hidden" name="id" value={id} />
      <input name="reason" placeholder="Lý do từ chối (không bắt buộc)" autoFocus style={{ flex: 1, minWidth: 180, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 9 }} />
      <button className="btn sm primary danger" type="submit" disabled={pending}>{pending ? "..." : "Xác nhận từ chối"}</button>
      <button className="btn sm" type="button" onClick={() => setOpen(false)}>Hủy</button>
      {state?.error && <div className="warn-box" style={{ width: "100%", margin: 0 }}>{state.error}</div>}
    </form>
  );
}
