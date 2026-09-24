import "server-only";

import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

/** Gợi ý Mã NV kế tiếp: lấy số lớn nhất trong các mã dạng NV### rồi +1 (VD NV009 → NV010). */
export async function suggestNextEmployeeCode() {
  const codes = await prisma.employee.findMany({ where: { code: { startsWith: "NV" } }, select: { code: true } });
  const max = codes.reduce((m, { code }) => {
    const n = /^NV(\d+)$/.exec(code)?.[1];
    return n ? Math.max(m, Number(n)) : m;
  }, 0);
  return `NV${String(max + 1).padStart(3, "0")}`;
}

export type LeaderConflict = { currentLeaderName: string; teamName: string };

/**
 * Giữ quy tắc "mỗi team 1 Leader" khi đổi Role / Team của 1 nhân sự:
 * - Role = Leader + có Team → thành Leader của team đó. Team đã có Leader khác thì
 *   trả về conflict (chưa đổi gì), trừ khi confirmReplace = true → Leader cũ về Nhân viên.
 * - Không còn là Leader, hoặc chuyển team → gỡ khỏi vị trí Leader của team cũ.
 * Gọi bên trong transaction, SAU khi đã cập nhật role/teamId của nhân sự.
 */
export async function syncTeamLeader(
  tx: Tx,
  args: { employeeId: string; role: Role | null; teamId: string | null; confirmReplace: boolean },
): Promise<LeaderConflict | null> {
  const { employeeId, role, teamId, confirmReplace } = args;
  const wantsToLead = role === "LEADER" && teamId;

  if (wantsToLead) {
    const team = await tx.team.findUniqueOrThrow({ where: { id: teamId }, include: { leader: true } });
    if (team.leader && team.leader.id !== employeeId) {
      if (!confirmReplace) return { currentLeaderName: team.leader.name, teamName: team.name };
      // Leader cũ về Nhân viên
      if (team.leader.role === "LEADER") {
        await tx.employee.update({ where: { id: team.leader.id }, data: { role: "EMPLOYEE" } });
      }
    }
  }

  // Gỡ vị trí Leader ở team khác (nếu có) rồi gán team mới
  await tx.team.updateMany({
    where: { leaderId: employeeId, ...(wantsToLead ? { NOT: { id: teamId } } : {}) },
    data: { leaderId: null },
  });
  if (wantsToLead) {
    await tx.team.update({ where: { id: teamId }, data: { leaderId: employeeId } });
  }
  return null;
}

/** Số Admin đang hoạt động (để không cho gỡ / khóa / xóa Admin cuối cùng). */
export function countActiveAdmins(tx: Tx | typeof prisma = prisma) {
  return tx.employee.count({ where: { role: "ADMIN", status: "ACTIVE", isLocked: false } });
}
