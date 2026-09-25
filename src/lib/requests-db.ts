import "server-only";

import type { Role } from "@/generated/prisma/enums";
import { logAudit } from "@/lib/audit";
import { getWorkdayChecker, recalcEmployeeMonth } from "@/lib/attendance";
import { annualLeaveEntitlement, annualLeaveShortage, leaveEligibleFrom } from "@/lib/leave-policy";
import { prisma } from "@/lib/db";
import { lateExemptionWarning, leaveUnitsInMonth, nextStatusOnApprove, TYPE_LABEL, validateRequest, type RequestInput } from "@/lib/requests";
import { getSetting } from "@/lib/settings-db";

export type Actor = { id: string; name: string; role: Role };
export type Result = { ok: true; message: string; warning?: string | null } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
};

async function notify(employeeIds: string[], type: "REQUEST_PENDING" | "REQUEST_APPROVED" | "REQUEST_REJECTED", title: string) {
  const ids = [...new Set(employeeIds)];
  if (!ids.length) return;
  await prisma.notification.createMany({ data: ids.map((employeeId) => ({ employeeId, type, title, link: type === "REQUEST_PENDING" ? "/requests?tab=approve" : "/requests" })) });
}

/** Ngày của các đơn đi muộn khác của nhân sự trong tháng chứa `day` (bỏ đơn từ chối / thu hồi / đã xóa). */
async function otherLateDays(employeeId: string, day: string, statuses: ("PENDING" | "LEADER_APPROVED" | "APPROVED")[], excludeId?: string) {
  const rows = await prisma.request.findMany({
    where: { employeeId, type: "LATE", deletedAt: null, status: { in: statuses }, dateFrom: monthRange(day.slice(0, 7)), ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { dateFrom: true },
  });
  return rows.flatMap((r) => (r.dateFrom ? [dayOf(r.dateFrom)] : []));
}

/**
 * Cảnh báo cho đơn đi muộn: "sẽ không được miễn phạt dù được duyệt" khi đã đủ số suất miễn phạt (§3.3).
 * includePending = true khi nhân sự tạo đơn (tính cả đơn đang chờ); false khi Leader/Admin duyệt (chỉ tính đơn đã duyệt).
 */
export async function lateWarning(req: { id?: string; employeeId: string; dateFrom: Date | null }, includePending: boolean) {
  if (!req.dateFrom) return null;
  const { freeExemptionsPerMonth } = await getSetting("latePenalty");
  const day = dayOf(req.dateFrom);
  const others = await otherLateDays(req.employeeId, day, includePending ? ["PENDING", "LEADER_APPROVED", "APPROVED"] : ["APPROVED"], req.id);
  return lateExemptionWarning(day, others, freeExemptionsPerMonth);
}

/** Vai trò của người này khi xử lý đơn: Admin (toàn công ty) / Leader (đơn của team mình dẫn) / không có quyền. */
export async function approverRole(actor: Actor, req: { employeeId: string; employee: { team: { leaderId: string | null } | null } }) {
  if (actor.role === "ADMIN") return "ADMIN" as const;
  if (actor.role !== "LEADER" || req.employeeId === actor.id) return null;
  const { leader } = await getSetting("rolePermissions");
  return leader.approve && req.employee.team?.leaderId === actor.id ? ("LEADER" as const) : null;
}

const withOwner = { employee: { select: { id: true, name: true, code: true, team: { select: { name: true, leaderId: true } } } } } as const;

/**
 * Phép năm của nhân sự trong năm (spec §4): được hưởng, đã dùng (đơn đã duyệt), đang chờ duyệt, còn lại.
 * Nhân sự mới phải qua thử việc mới có phép (trừ khi hồ sơ có cờ "Bỏ qua thử việc").
 */
export async function annualLeaveBalance(employeeId: string, year: number) {
  const [employee, policy, requests, isWork] = await Promise.all([
    prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { joinedAt: true, skipProbation: true } }),
    getSetting("leavePolicy"),
    prisma.request.findMany({
      where: { employeeId, type: "LEAVE", leaveSubtype: "ANNUAL", deletedAt: null, status: { in: ["PENDING", "LEADER_APPROVED", "APPROVED"] }, dateFrom: { lte: new Date(Date.UTC(year, 11, 31)) }, dateTo: { gte: new Date(Date.UTC(year, 0, 1)) } },
      select: { status: true, dateFrom: true, dateTo: true, dayPortion: true },
    }),
    getWorkdayChecker(`${year}-01-01`, `${year}-12-31`),
  ]);
  const eligibleFrom = leaveEligibleFrom(employee.joinedAt ? dayOf(employee.joinedAt) : null, employee.skipProbation, policy);
  const entitlement = annualLeaveEntitlement(year, eligibleFrom, policy);
  let used = 0;
  let pending = 0;
  for (const r of requests) {
    if (!r.dateFrom || !r.dateTo) continue;
    // leaveUnitsInMonth lọc theo tiền tố ngày nên truyền năm "2026" là đếm cả năm
    const units = leaveUnitsInMonth({ dateFrom: dayOf(r.dateFrom), dateTo: dayOf(r.dateTo), dayPortion: r.dayPortion }, String(year), isWork);
    if (r.status === "APPROVED") used += units;
    else pending += units;
  }
  return { year, entitlement, used, pending, remaining: Math.round((entitlement - used - pending) * 100) / 100, eligibleFrom };
}

/** Nhân sự tạo đơn. Trả cảnh báo nếu đơn đi muộn này sẽ không được miễn phạt. */
export async function createRequest(actor: Actor, input: RequestInput): Promise<Result> {
  const error = validateRequest(input);
  if (error) return fail(error);

  // Admin bật/tắt nút chức năng theo role (§2): WFH / Tạm ứng
  const perms = await getSetting("rolePermissions");
  if (actor.role !== "ADMIN") {
    if (input.type === "WFH" && !perms.employee.wfh) return fail("Chức năng xin WFH đang tắt");
    if (input.type === "SALARY_ADVANCE" && !perms.employee.advance) return fail("Chức năng tạm ứng lương đang tắt");
  }

  // Nghỉ phép không được vượt phép năm (đã trừ đơn đang chờ duyệt); phần vượt phải xin "Nghỉ không lương"
  if (input.type === "LEAVE" && input.leaveSubtype === "ANNUAL" && input.dateFrom && input.dateTo) {
    const isWork = await getWorkdayChecker(input.dateFrom, input.dateTo);
    for (const year of new Set([Number(input.dateFrom.slice(0, 4)), Number(input.dateTo.slice(0, 4))])) {
      const needed = leaveUnitsInMonth({ dateFrom: input.dateFrom, dateTo: input.dateTo, dayPortion: input.dayPortion }, String(year), isWork);
      if (needed <= 0) continue;
      const bal = await annualLeaveBalance(actor.id, year);
      const shortage = annualLeaveShortage({ year, entitlement: bal.entitlement, used: bal.used + bal.pending, needed, eligibleFrom: bal.eligibleFrom, leaveFromMonth: input.dateFrom!.slice(0, 7) });
      if (shortage) return fail(shortage);
    }
  }

  const oneDay = input.type === "OT" || input.type === "LATE" || input.type === "EARLY_LEAVE";
  const created = await prisma.request.create({
    data: {
      employeeId: actor.id,
      type: input.type,
      leaveSubtype: input.type === "LEAVE" ? input.leaveSubtype : null,
      dateFrom: input.dateFrom ? new Date(`${input.dateFrom}T00:00:00Z`) : null,
      dateTo: oneDay ? (input.dateFrom ? new Date(`${input.dateFrom}T00:00:00Z`) : null) : input.dateTo ? new Date(`${input.dateTo}T00:00:00Z`) : null,
      dayPortion: input.type === "LEAVE" || input.type === "WFH" ? (input.dayPortion ?? "FULL") : null,
      timeFrom: oneDay ? input.timeFrom : null,
      timeTo: oneDay ? input.timeTo : null,
      amount: input.type === "SALARY_ADVANCE" ? input.amount : null,
      reason: input.reason.trim(),
    },
    include: withOwner,
  });

  // Báo cho người duyệt: Leader của team (nếu không phải chính mình) và mọi Admin
  const admins = await prisma.employee.findMany({ where: { role: "ADMIN", status: "ACTIVE", isLocked: false, NOT: { id: actor.id } }, select: { id: true } });
  const leaderId = created.employee.team?.leaderId;
  await notify([...admins.map((a) => a.id), ...(leaderId && leaderId !== actor.id ? [leaderId] : [])], "REQUEST_PENDING", `${actor.name} gửi đơn ${TYPE_LABEL[input.type]}`);

  const warning = input.type === "LATE" ? await lateWarning(created, true) : null;
  return { ok: true, message: "Đã gửi đơn, chờ duyệt.", warning };
}

async function load(id: string) {
  return prisma.request.findUnique({ where: { id }, include: withOwner });
}

async function afterChange(req: { type: string; employeeId: string; dateFrom: Date | null; dateTo: Date | null }) {
  // Đơn đi muộn đổi trạng thái → suất miễn phạt của tháng có thể dồn sang đơn khác → tính lại công tháng đó
  // Đơn nghỉ / WFH đổi trạng thái → buổi nghỉ thay đổi cách tính công các ngày trong đơn → tính lại các tháng đó
  if (!req.dateFrom || !["LATE", "LEAVE", "WFH"].includes(req.type)) return;
  const months = new Set([dayOf(req.dateFrom).slice(0, 7), dayOf(req.dateTo ?? req.dateFrom).slice(0, 7)]);
  for (const month of months) await recalcEmployeeMonth(req.employeeId, month);
}

/** Leader / Admin duyệt. 1 cấp: duyệt xong là APPROVED; 2 cấp (theo cấu hình từng loại đơn): Leader → chờ Admin. */
export async function approveRequest(actor: Actor, id: string): Promise<Result> {
  const req = await load(id);
  if (!req || req.deletedAt) return fail("Không tìm thấy đơn");
  const role = await approverRole(actor, req);
  if (!role) return fail("Bạn không có quyền duyệt đơn này");

  const levels = (await getSetting("approvalLevels"))[req.type];
  const next = nextStatusOnApprove(levels, req.status, role);
  if (!next) return fail(req.status === "LEADER_APPROVED" ? "Đơn đã được Leader duyệt, đang chờ Admin" : "Đơn này không còn ở trạng thái chờ duyệt");

  const now = new Date();
  await prisma.request.update({
    where: { id },
    data:
      next === "LEADER_APPROVED"
        ? { status: next, leaderApprovedById: actor.id, leaderApprovedAt: now }
        : { status: next, approvedById: actor.id, approvedAt: now, ...(role === "LEADER" ? { leaderApprovedById: actor.id, leaderApprovedAt: now } : {}) },
  });

  const self = actor.id === req.employeeId ? " (tự duyệt đơn của mình)" : "";
  await logAudit({ actorId: actor.id, action: "request.approve", targetType: "Request", targetId: id, summary: `Duyệt đơn ${TYPE_LABEL[req.type]} của ${req.employee.name} (${req.employee.code})${self} → ${next === "APPROVED" ? "đã duyệt" : "Leader đã duyệt, chờ Admin"}` });

  if (next === "LEADER_APPROVED") {
    const admins = await prisma.employee.findMany({ where: { role: "ADMIN", status: "ACTIVE", isLocked: false, NOT: { id: actor.id } }, select: { id: true } });
    await notify(admins.map((a) => a.id), "REQUEST_PENDING", `Đơn ${TYPE_LABEL[req.type]} của ${req.employee.name} cần Admin duyệt`);
    return { ok: true, message: "Đã duyệt, chuyển Admin duyệt tiếp." };
  }
  await notify([req.employeeId], "REQUEST_APPROVED", `Đơn ${TYPE_LABEL[req.type]} của bạn đã được duyệt`);
  await afterChange(req);
  return { ok: true, message: "Đã duyệt đơn." };
}

export async function rejectRequest(actor: Actor, id: string, reason: string): Promise<Result> {
  const req = await load(id);
  if (!req || req.deletedAt) return fail("Không tìm thấy đơn");
  const role = await approverRole(actor, req);
  if (!role) return fail("Bạn không có quyền xử lý đơn này");
  if (req.status !== "PENDING" && !(req.status === "LEADER_APPROVED" && role === "ADMIN")) return fail("Đơn này không còn ở trạng thái chờ duyệt");

  await prisma.request.update({ where: { id }, data: { status: "REJECTED", rejectedById: actor.id, rejectedAt: new Date(), rejectReason: reason.trim().slice(0, 500) || null } });
  await logAudit({ actorId: actor.id, action: "request.reject", targetType: "Request", targetId: id, summary: `Từ chối đơn ${TYPE_LABEL[req.type]} của ${req.employee.name} (${req.employee.code})${reason.trim() ? `: ${reason.trim().slice(0, 100)}` : ""}` });
  await notify([req.employeeId], "REQUEST_REJECTED", `Đơn ${TYPE_LABEL[req.type]} của bạn bị từ chối`);
  return { ok: true, message: "Đã từ chối đơn." };
}

/** Nhân sự thu hồi đơn của mình khi còn chờ duyệt (chưa duyệt xong). */
export async function withdrawRequest(actor: Actor, id: string): Promise<Result> {
  const req = await load(id);
  if (!req || req.deletedAt || req.employeeId !== actor.id) return fail("Không tìm thấy đơn");
  if (req.status !== "PENDING" && req.status !== "LEADER_APPROVED") return fail("Chỉ thu hồi được đơn đang chờ duyệt");
  await prisma.request.update({ where: { id }, data: { status: "WITHDRAWN" } });
  return { ok: true, message: "Đã thu hồi đơn." };
}

/**
 * Admin / Leader (team mình) xóa đơn ở mọi trạng thái, kể cả đã duyệt: đơn bị ẩn và phần đã áp dụng được hoàn lại.
 * Đơn đi muộn: công của tháng tự tính lại (suất miễn phạt dồn sang đơn khác). OT / nghỉ / tạm ứng: lương chỉ đổi khi bấm "Tính lại".
 */
export async function deleteRequest(actor: Actor, id: string): Promise<Result> {
  const req = await load(id);
  if (!req || req.deletedAt) return fail("Không tìm thấy đơn");
  if (!(await approverRole(actor, req))) return fail("Bạn không có quyền xóa đơn này");

  await prisma.request.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.id } });
  await logAudit({ actorId: actor.id, action: "request.delete", targetType: "Request", targetId: id, summary: `Xóa đơn ${TYPE_LABEL[req.type]} của ${req.employee.name} (${req.employee.code}), trạng thái trước khi xóa: ${req.status}` });
  if (req.status === "APPROVED") await afterChange(req);
  const payrollNote = req.status === "APPROVED" && req.type !== "LATE" && req.type !== "EARLY_LEAVE" ? " Nếu đã tính lương tháng đó, hãy bấm “Tính lại” ở Bảng lương." : "";
  return { ok: true, message: `Đã xóa đơn.${payrollNote}` };
}

// ───────────────────────── Danh sách ─────────────────────────

export async function listMyRequests(employeeId: string) {
  return prisma.request.findMany({
    where: { employeeId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { approvedBy: { select: { name: true } }, leaderApprovedBy: { select: { name: true } }, rejectedBy: { select: { name: true } } },
  });
}

/** Đơn cần duyệt: Admin thấy toàn công ty (chờ duyệt / Leader đã duyệt); Leader chỉ đơn PENDING của team mình dẫn. */
function approverScope(actor: Actor) {
  return actor.role === "ADMIN" ? {} : { employeeId: { not: actor.id }, employee: { team: { leaderId: actor.id } } };
}

export async function listToApprove(actor: Actor) {
  return prisma.request.findMany({
    where: { deletedAt: null, status: actor.role === "ADMIN" ? { in: ["PENDING", "LEADER_APPROVED"] } : "PENDING", ...approverScope(actor) },
    orderBy: { createdAt: "asc" },
    include: { ...withOwner, leaderApprovedBy: { select: { name: true } } },
  });
}

/** Đơn đã xử lý 30 ngày gần nhất trong phạm vi của người duyệt (để tra cứu / xóa). */
export async function listProcessed(actor: Actor) {
  return prisma.request.findMany({
    where: { deletedAt: null, status: { in: ["APPROVED", "REJECTED"] }, updatedAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, ...approverScope(actor) },
    orderBy: { updatedAt: "desc" },
    take: 30,
    include: { ...withOwner, approvedBy: { select: { name: true } }, rejectedBy: { select: { name: true } } },
  });
}

export async function countToApprove(actor: Actor) {
  return prisma.request.count({ where: { deletedAt: null, status: actor.role === "ADMIN" ? { in: ["PENDING", "LEADER_APPROVED"] } : "PENDING", ...approverScope(actor) } });
}
