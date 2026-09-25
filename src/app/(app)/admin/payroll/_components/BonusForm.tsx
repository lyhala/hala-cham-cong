"use client";

import { useActionState, useState } from "react";
import { addBonusAction } from "../actions";

// Thêm công bù cho 1 nhân sự ở tháng đang xem (Bảng lương). Số công không giới hạn trần; lý do bắt buộc.
export function BonusForm({ employeeId, month }: { employeeId: string; month: string }) {
  const [round, setRound] = useState(0); // đổi key để xóa ô nhập sau khi lưu xong
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof addBonusAction>>, fd: FormData) => {
    const result = await addBonusAction(prev, fd);
    if (result?.ok) setRound((n) => n + 1);
    return result;
  }, undefined);

  return (
    <form action={action} key={round} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="month" value={month} />
      <input name="units" inputMode="decimal" placeholder="Số công bù (VD 3)" required style={{ padding: "6px 9px", border: "1px solid var(--border)", borderRadius: 8 }} />
      <input name="note" placeholder="Lý do (VD: đền bù chuyến du lịch)" required maxLength={200} style={{ padding: "6px 9px", border: "1px solid var(--border)", borderRadius: 8 }} />
      <button className="btn sm primary" type="submit" disabled={pending}>{pending ? "Đang lưu..." : "Thêm công bù"}</button>
      {state?.error && <div className="warn-box" style={{ margin: 0 }}>{state.error}</div>}
      {state?.ok && <div className="ok-box" style={{ margin: 0 }}>{state.message}</div>}
    </form>
  );
}
