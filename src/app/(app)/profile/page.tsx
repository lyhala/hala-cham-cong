import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { ROLE_LABEL } from "@/lib/nav";

export default async function ProfilePage() {
  const user = await requireUser();
  const me = await prisma.employee.findUniqueOrThrow({
    where: { id: user.id },
    include: { team: { include: { leader: { select: { name: true } } } } },
  });

  const rows: [string, React.ReactNode][] = [
    ["Mã NV", me.code],
    ["Email", me.email ?? "—"],
    ["Số điện thoại", me.phone ?? "—"],
    ["Địa chỉ", me.address ?? "—"],
    ["Team", me.team?.name ?? <span style={{ color: "var(--danger)" }}>Chưa chọn</span>],
    ["Leader", me.team?.leader?.name ?? "Chưa gán"],
    ["Role", ROLE_LABEL[user.role]],
  ];

  return (
    <>
      <h1>Hồ sơ cá nhân</h1>
      <div className="subtitle">{me.name}</div>

      <div className="card" style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14 }}>
        <div
          style={{
            width: 64, height: 64, borderRadius: 12, background: "var(--navy-soft)", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontSize: 11, color: "var(--text-3)", textAlign: "center",
          }}
        >
          {me.faceImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.faceImageUrl} alt="Ảnh FaceID" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            "Chưa có ảnh"
          )}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>
          Ảnh FaceID dùng để chấm công bằng camera Hanet (chỉ xem, Admin cập nhật).
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <tbody>
            {rows.map(([label, value], i) => (
              <tr key={label}>
                <td style={{ color: "var(--text-2)", width: 140, borderTop: i ? undefined : "none" }}>{label}</td>
                <td style={{ borderTop: i ? undefined : "none" }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <Link href="/change-password" className="btn">🔑 Đổi mật khẩu</Link>
        <form action={logout}>
          <button className="btn danger" type="submit">Đăng xuất</button>
        </form>
      </div>
    </>
  );
}
