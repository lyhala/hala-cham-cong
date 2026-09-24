"use client";

import { useActionState } from "react";
import type { ActionState } from "../actions";
import { TempPasswordBox } from "./TempPasswordBox";

type Props = {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: React.ReactNode;
  /** Hỏi xác nhận trước khi chạy */
  confirm?: string;
  className?: string;
  title?: string;
  /** Hiện thông báo kết quả ngay dưới nút */
  showResult?: boolean;
};

// Nút bấm chạy 1 server action (kèm hộp xác nhận nếu cần), hiện lỗi / kết quả ngay bên dưới.
export function ActionButton({ action, fields, label, confirm, className = "btn sm", title, showResult = true }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      style={{ display: "contents" }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button className={className} type="submit" disabled={pending} title={title}>
        {pending ? "..." : label}
      </button>
      {showResult && state?.error && <div className="warn-box" style={{ width: "100%", marginTop: 8 }}>{state.error}</div>}
      {showResult && state?.tempPassword && (
        <div style={{ width: "100%", marginTop: 8 }}>
          <TempPasswordBox password={state.tempPassword} />
        </div>
      )}
      {showResult && state?.ok && state.message && !state.tempPassword && (
        <div className="ok-box" style={{ width: "100%", marginTop: 8 }}>{state.message}</div>
      )}
    </form>
  );
}
