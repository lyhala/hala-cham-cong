"use client";

import { useActionState, useState } from "react";
import { ActionButton } from "../../employees/_components/ActionButton";
import type { ConfigState } from "../actions";

/** Form cấu hình: các ô nhập (server render) là children; hiện lỗi / "Đã lưu" ngay dưới nút. */
export function ConfigForm({ action, children, label = "Lưu" }: { action: (s: ConfigState, fd: FormData) => Promise<ConfigState>; children: React.ReactNode; label?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction}>
      {children}
      {state?.error && <div className="warn-box">{state.error}</div>}
      {state?.ok && <div className="ok-box">{state.message}</div>}
      <button className="btn primary" type="submit" disabled={pending}>{pending ? "Đang lưu..." : label}</button>
    </form>
  );
}

type MonthAction = { action: (s: ConfigState, fd: FormData) => Promise<ConfigState>; label: string; primary?: boolean; confirm?: string };

/** Chọn tháng rồi bấm 1 trong các nút (tính lại công, tạo tab Performance, sync điểm...). */
export function MonthActions({ initialMonth, actions }: { initialMonth: string; actions: MonthAction[] }) {
  const [month, setMonth] = useState(initialMonth);
  return (
    <div className="toolbar">
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Tháng" />
      {actions.map((a) => (
        <ActionButton key={a.label} action={a.action} fields={{ month }} label={a.label} className={`btn ${a.primary ? "primary" : ""}`} confirm={a.confirm} />
      ))}
    </div>
  );
}
