import "server-only";

import { prisma } from "@/lib/db";

/** Ghi nhật ký thao tác nhạy cảm: ai / làm gì / lúc nào (spec §15). */
export async function logAudit(entry: {
  actorId: string | null;
  action: string;
  summary: string;
  targetType?: string;
  targetId?: string;
}) {
  await prisma.auditLog.create({ data: entry });
}
