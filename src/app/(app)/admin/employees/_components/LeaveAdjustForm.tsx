"use client";

import { startTransition, useActionState, useState } from "react";
import { addLeaveAdjustment } from "../actions";

// Form "Điều chỉnh phép năm" trong hồ sơ nhân sự (§4): Admin cộng / trừ ngày phép kèm lý do.
export function LeaveAdjustForm({ employeeId, year }: { employeeId: string; year: number }) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState(async (prev: Awaited<ReturnType<typeof addLeaveAdjustment>>, fd: FormData) => {
    const result = await addLeaveAdjustment(prev, fd);
    if (result?.ok) setOpen(false);
    return result;
  }, undefined);

  if (!open) {
    return (
      <div>
        {state?.ok && <div className="ok-box">{state.message}</div>}
        <button type="button" className="btn sm" onClick={() => setOpen(true)}>+ Điều chỉnh số phép</button>
      </div>
    );
  }

  return (
    <form
      className="card"
      style={{ background: "var(--bg)" }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => dispatch(fd));
      }}
    >
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="grid3">
        <div className="field">
          <label htmlFor="leaveYear">Năm</label>
          <input id="leaveYear" name="year" type="number" defaultValue={year} required />
        </div>
        <div className="field">
          <label htmlFor="leaveDays">Số ngày (+ cộng, − trừ)</label>
          <input id="leaveDays" name="days" inputMode="decimal" placeholder="VD 2 hoặc -1,5" required />
        </div>
        <div className="field">
          <label htmlFor="leaveNote">Lý do</label>
          <input id="leaveNote" name="note" placeholder="VD: Phép tồn năm trước được duyệt giữ lại" required maxLength={200} />
        </div>
      </div>
      {state?.error && <div className="warn-box">{state.error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn sm primary" type="submit" disabled={pending}>{pending ? "Đang lưu..." : "Lưu điều chỉnh"}</button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>Hủy</button>
      </div>
    </form>
  );
}
