import { Brand } from "@/components/Brand";
import { requireUser } from "@/lib/auth/session";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata = { title: "Đổi mật khẩu — Hala Games" };

export default async function ChangePasswordPage() {
  const user = await requireUser({ allowMustChangePassword: true });

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Brand />
        <h1>Đổi mật khẩu</h1>
        <div className="subtitle">{user.name} · {user.email}</div>
        {user.mustChangePassword && (
          <div className="info-box">
            Đây là lần đăng nhập đầu tiên. Vui lòng đổi mật khẩu mặc định trước khi sử dụng.
          </div>
        )}
        <ChangePasswordForm canCancel={!user.mustChangePassword} />
      </div>
    </main>
  );
}
