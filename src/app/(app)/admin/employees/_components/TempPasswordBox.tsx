"use client";

import { useState } from "react";

// Hiện mật khẩu tạm MỘT LẦN cho Admin gửi riêng cho nhân sự (hệ thống không lưu bản gốc).
export function TempPasswordBox({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="pw-box">
      <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>Mật khẩu tạm (chỉ hiện 1 lần)</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <code>{password}</code>
        <button
          type="button"
          className="btn sm"
          onClick={async () => {
            await navigator.clipboard.writeText(password);
            setCopied(true);
          }}
        >
          {copied ? "✓ Đã chép" : "Chép"}
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 6 }}>
        Gửi riêng cho nhân sự (Zalo / tin nhắn). Khi đăng nhập lần đầu, hệ thống sẽ bắt đổi mật khẩu mới.
      </div>
    </div>
  );
}
