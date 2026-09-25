import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { getCurrentUser, homePathFor } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Đăng nhập — Hala Games" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : homePathFor(user));

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Brand />
        <h1>Đăng nhập</h1>
        <div className="subtitle">Chấm công · Lương nội bộ</div>
        <LoginForm />
      </div>
    </main>
  );
}
