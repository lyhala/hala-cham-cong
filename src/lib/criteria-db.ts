import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { CriterionRow } from "@/lib/config-validate";
import { prisma } from "@/lib/db";

/**
 * Áp dụng danh sách tiêu chí Performance đã kiểm tra hợp lệ (tổng trọng số = 100%): sửa tên / trọng số / nhóm,
 * thêm dòng mới (id trống), xóa dòng đánh dấu xóa. Xóa tiêu chí sẽ xóa luôn điểm đã sync của tiêu chí đó (Cascade).
 * Thứ tự hiển thị theo thứ tự dòng. Tất cả trong 1 transaction — lỗi thì không đổi gì.
 */
export async function applyCriteria(rows: CriterionRow[]) {
  const existing = new Set((await prisma.performanceCriterion.findMany({ select: { id: true } })).map((c) => c.id));
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  let sortOrder = 0;
  let removed = 0;
  let kept = 0;
  for (const r of rows) {
    if (r.id && !existing.has(r.id)) continue; // id lạ (form cũ đã hết hạn) — bỏ qua
    if (r.remove && r.id) {
      ops.push(prisma.performanceCriterion.delete({ where: { id: r.id } }));
      removed++;
    } else if (r.id) {
      ops.push(prisma.performanceCriterion.update({ where: { id: r.id }, data: { name: r.name, weight: r.weight, group: r.group, sortOrder: sortOrder++ } }));
      kept++;
    } else {
      ops.push(prisma.performanceCriterion.create({ data: { name: r.name, weight: r.weight, group: r.group, sortOrder: sortOrder++ } }));
      kept++;
    }
  }
  await prisma.$transaction(ops);
  return { kept, removed };
}
