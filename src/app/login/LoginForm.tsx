"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action}>
      {state?.error && <div className="warn-box">{state.error}</div>}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="password">Mật khẩu</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="btn primary block" type="submit" disabled={pending}>
        {pending ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>
      <p className="subtitle" style={{ marginTop: 14, marginBottom: 0, textAlign: "center" }}>
        Quên mật khẩu? Liên hệ Admin để được cấp lại.
      </p>
    </form>
  );
}
