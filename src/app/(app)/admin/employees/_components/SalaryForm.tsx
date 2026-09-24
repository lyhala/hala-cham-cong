"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { addSalaryHistory } from "../actions";

function formatMoneyInput(raw: string) {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? Number(digits).toLocaleString("vi-VN") : "";
}

// Form "+ Thêm điều chỉnh lương" trong hồ sơ nhân sự (§6.2)
export function SalaryForm({ employeeId, today, lastBase, lastPerf }: { employeeId: string; today: string; lastBase: number | null; lastPerf: number | null }) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState(async (prev: Awaited<ReturnType<typeof addSalaryHistory>>, fd: FormData) => {
    const result = await addSalaryHistory(prev, fd);
    if (result?.ok) setOpen(false);
    return result;
  }, undefined);
  const [base, setBase] = useState(lastBase != null ? lastBase.toLocaleString("vi-VN") : "");
  const [perf, setPerf] = useState(lastPerf != null ? lastPerf.toLocaleString("vi-VN") : "");
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <div>
        {state?.ok && <div className="ok-box">{state.message}</div>}
        <button type="button" className="btn sm" onClick={() => setOpen(true)}>
          + Thêm điều chỉnh lương
        </button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className="card"
      style={{ background: "var(--bg)" }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => dispatch(fd));
      }}
    >
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="grid2">
        <div className="field">
          <label htmlFor="baseSalary">Lương base mới (đ)</label>
          <input id="baseSalary" name="baseSalary" inputMode="numeric" value={base} onChange={(e) => setBase(formatMoneyInput(e.target.value))} required />
        </div>
        <div className="field">
          <label htmlFor="perfSalary">Lương performance mới (đ)</label>
          <input id="perfSalary" name="perfSalary" inputMode="numeric" value={perf} onChange={(e) => setPerf(formatMoneyInput(e.target.value))} required />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="effectiveFrom">Hiệu lực từ ngày</label>
          <input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={today} required />
        </div>
        <div className="field">
          <label htmlFor="note">Ghi chú / lý do</label>
          <input id="note" name="note" placeholder="VD: Tăng lương định kỳ" />
        </div>
      </div>
      {state?.error && <div className="warn-box">{state.error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn sm primary" type="submit" disabled={pending}>
          {pending ? "Đang lưu..." : "Lưu điều chỉnh"}
        </button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>
          Hủy
        </button>
      </div>
    </form>
  );
}
