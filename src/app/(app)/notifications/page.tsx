import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { dateTimeVN } from "@/lib/dates";

const ICONS: Record<string, string> = {
  REQUEST_PENDING: "📝",
  REQUEST_APPROVED: "✅",
  REQUEST_REJECTED: "❌",
  PAYSLIP_SENT: "💰",
  BONUS_RECEIVED: "🎁",
  OTHER: "🔔",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({
    where: { employeeId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <>
      <h1>Thông báo</h1>
      <div className="subtitle">Đơn cần duyệt, kết quả duyệt đơn, lương, thưởng</div>
      <div className="card" style={{ padding: "4px 14px" }}>
        {items.length === 0 && <div className="empty">Không có thông báo nào</div>}
        {items.map((it, i) => (
          <Link
            key={it.id}
            href={it.link ?? "#"}
            style={{ display: "flex", gap: 10, padding: "11px 0", borderTop: i ? "1px solid var(--border)" : "none" }}
          >
            <span style={{ fontSize: 16 }}>{ICONS[it.type]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: it.readAt ? 400 : 600 }}>{it.title}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{dateTimeVN(it.createdAt)}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
