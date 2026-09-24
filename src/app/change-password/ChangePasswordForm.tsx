"use client";

import Link from "next/link";
import { useActionState } from "react";
import { changePassword, logout } from "@/app/actions/auth";

export function ChangePasswordForm({ canCancel }: { canCancel: boolean }) {
  const [state, action, pending] = useActionState(changePassword, undefined);

  return (
    <>
      <form action={action}>
        {state?.error && <div className="warn-box">{state.error}</div>}
        <div className="field">
          <label htmlFor="currentPassword">Mật khẩu hiện tại</label>
          <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
        </div>
        <div className="field">
          <label htmlFor="newPassword">Mật khẩu mới (tối thiểu 8 ký tự, có chữ và số)</label>
          <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="field">
          <label htmlFor="confirmPassword">Nhập lại mật khẩu mới</label>
          <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
        </div>
        <button className="btn primary block" type="submit" disabled={pending}>
          {pending ? "Đang lưu..." : "Đổi mật khẩu"}
        </button>
      </form>
      <div style={{ marginTop: 12, textAlign: "center" }}>
        {canCancel ? (
          <Link href="/" className="btn">Quay lại</Link>
        ) : (
          <form action={logout}>
            <button className="btn" type="submit">Đăng xuất</button>
          </form>
        )}
      </div>
    </>
  );
}
