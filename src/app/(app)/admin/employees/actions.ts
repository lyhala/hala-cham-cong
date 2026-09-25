"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { logAudit } from "@/lib/audit";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { clearFailuresForEmail } from "@/lib/auth/rate-limit";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { countActiveAdmins, suggestNextEmployeeCode, syncTeamLeader, type LeaderConflict } from "@/lib/employees";
import { fromDateInput, parseMoney } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/nav";

// Mọi hàm ở file này đều gọi requireRole("ADMIN") trước tiên: server action là API công khai,
// không được dựa vào việc chỉ Admin mới thấy nút.

export type ActionState =
  | {
      ok?: boolean;
      error?: string;
      /** Link đi kèm lỗi, VD trỏ thẳng tới hồ sơ đang giữ email trùng (kể cả khi hồ sơ đó đang bị lọc ẩn) */
      errorLink?: { href: string; label: string };
      message?: string;
      tempPassword?: string;
      employeeId?: string;
      nextCode?: string;
      created?: { code: string; name: string };
      confirmLeader?: LeaderConflict;
    }
  | undefined;

class LeaderConflictError extends Error {
  constructor(public conflict: LeaderConflict) {
    super("leader-conflict");
  }
}

function refresh() {
  revalidatePath("/admin/employees", "layout");
}

function isUniqueError(e: unknown, field: string) {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    JSON.stringify(e.meta ?? {}).includes(field)
  );
}

/**
 * Thông báo rõ khi trùng email: nếu email đó thuộc người ĐÃ NGHỈ (hồ sơ vẫn giữ để tính lương
 * tháng cuối, spec §10), nói rõ để Admin biết vào hồ sơ đó xóa hẳn hoặc cho đi làm lại, thay vì
 * chỉ báo "đã được dùng" khiến tưởng nhầm người đó vẫn đang làm. Kèm link đi thẳng tới hồ sơ đó —
 * hồ sơ Đã nghỉ bị ẩn khỏi danh sách mặc định nên nếu chỉ báo tên, Admin sẽ không tìm ra được.
 */
async function emailConflictError(
  email: string | null,
  excludeId?: string,
): Promise<{ error: string; errorLink?: { href: string; label: string } }> {
  if (!email) return { error: `Email đã được dùng cho người khác` };
  const existing = await prisma.employee.findFirst({
    where: { email, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
  });
  if (!existing) return { error: `Email ${email} đã được dùng cho người khác` };
  const link = { href: `/admin/employees/${existing.id}`, label: `Mở hồ sơ ${existing.name} (${existing.code})` };
  if (existing.status === "RESIGNED") {
    return {
      error: `Email ${email} đang thuộc hồ sơ ĐÃ NGHỈ của ${existing.name} (${existing.code}) — hồ sơ này đang ẩn khỏi danh sách "Đang làm" nên bạn không tìm thấy qua tìm kiếm thường. Vào hồ sơ đó để "Xóa hẳn" (nếu chắc chắn không cần dữ liệu cũ, VD đã xuất lương tháng cuối) hoặc "Đi làm lại" rồi mới dùng email này cho người khác.`,
      errorLink: link,
    };
  }
  return { error: `Email ${email} đang được dùng cho ${existing.name} (${existing.code}, đang làm)`, errorLink: link };
}

const optionalText = z
  .string()
  .trim()
  .transform((v) => v || null);

const EmployeeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Vui lòng nhập Mã NV")
    .regex(/^[A-Z0-9_-]+$/, "Mã NV chỉ gồm chữ không dấu, số, gạch ngang"),
  name: z.string().trim().min(1, "Vui lòng nhập tên"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v || null)
    .refine((v) => v === null || z.email().safeParse(v).success, "Email không hợp lệ"),
  phone: optionalText,
  address: optionalText,
  teamId: optionalText,
  role: z
    .enum(["", "EMPLOYEE", "LEADER", "ADMIN"])
    .transform((v) => (v === "" ? null : v)),
});

function readEmployeeForm(fd: FormData) {
  const parsed = EmployeeSchema.safeParse({
    code: fd.get("code") ?? "",
    name: fd.get("name") ?? "",
    email: fd.get("email") ?? "",
    phone: fd.get("phone") ?? "",
    address: fd.get("address") ?? "",
    teamId: fd.get("teamId") ?? "",
    role: fd.get("role") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  // Số tháng thử việc riêng: trống = mặc định công ty, 0 = bỏ qua thử việc
  const probationRaw = String(fd.get("probationMonths") ?? "").trim();
  if (probationRaw !== "" && !(/^\d+$/.test(probationRaw) && Number(probationRaw) <= 24)) {
    return { error: "Số tháng thử việc phải là số nguyên từ 0 đến 24 (để trống = mặc định của công ty)" } as const;
  }
  return {
    data: {
      ...parsed.data,
      joinedAt: fromDateInput(fd.get("joinedAt")),
      isCEO: fd.get("isCEO") === "on",
      attendanceExempt: fd.get("attendanceExempt") === "on",
      noProject: fd.get("noProject") === "on",
      parkingOutside: fd.get("parkingOutside") === "on",
      probationMonths: probationRaw === "" ? null : Number(probationRaw),
    },
    confirmReplace: fd.get("confirmReplaceLeader") === "1",
  } as const;
}

// ───────────────────────── Thêm / sửa nhân sự ─────────────────────────

export async function createEmployee(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const form = readEmployeeForm(fd);
  if ("error" in form) return { error: form.error };
  const { data, confirmReplace } = form;

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (data.isCEO) await tx.employee.updateMany({ where: { isCEO: true }, data: { isCEO: false } });
      const e = await tx.employee.create({ data: { ...data, passwordHash, mustChangePassword: true } });
      const conflict = await syncTeamLeader(tx, { employeeId: e.id, role: e.role, teamId: e.teamId, confirmReplace });
      if (conflict) throw new LeaderConflictError(conflict);
      return e;
    });

    await logAudit({
      actorId: admin.id,
      action: "employee.create",
      targetType: "Employee",
      targetId: created.id,
      summary: `Thêm nhân sự ${created.code} - ${created.name}${created.role ? ` (${ROLE_LABEL[created.role]})` : ""}`,
    });
    refresh();
    return {
      ok: true,
      tempPassword,
      employeeId: created.id,
      nextCode: await suggestNextEmployeeCode(),
      created: { code: created.code, name: created.name },
      message: `Đã thêm ${created.name}`,
    };
  } catch (e) {
    if (e instanceof LeaderConflictError) return { confirmLeader: e.conflict };
    if (isUniqueError(e, "code")) return { error: `Mã NV ${data.code} đã tồn tại` };
    if (isUniqueError(e, "email")) return await emailConflictError(data.email);
    throw e;
  }
}

export async function updateEmployee(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const id = String(fd.get("id") ?? "");
  const before = await prisma.employee.findUnique({ where: { id }, include: { team: true } });
  if (!before) return { error: "Không tìm thấy nhân sự" };

  const form = readEmployeeForm(fd);
  if ("error" in form) return { error: form.error };
  const { data, confirmReplace } = form;

  // Không tự gỡ quyền Admin của chính mình / của Admin cuối cùng
  if (before.role === "ADMIN" && data.role !== "ADMIN") {
    if (before.id === admin.id) return { error: "Bạn không thể tự gỡ quyền Admin của chính mình" };
    if ((await countActiveAdmins()) <= 1) return { error: "Phải còn ít nhất 1 Admin" };
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (data.isCEO) {
        await tx.employee.updateMany({ where: { isCEO: true, NOT: { id } }, data: { isCEO: false } });
      }
      const e = await tx.employee.update({ where: { id }, data, include: { team: true } });
      const conflict = await syncTeamLeader(tx, { employeeId: id, role: e.role, teamId: e.teamId, confirmReplace });
      if (conflict) throw new LeaderConflictError(conflict);
      return e;
    });

    const changes: string[] = [];
    if (before.role !== updated.role) {
      changes.push(`Role: ${before.role ? ROLE_LABEL[before.role] : "Chưa chọn"} → ${updated.role ? ROLE_LABEL[updated.role] : "Chưa chọn"}`);
    }
    if (before.teamId !== updated.teamId) {
      changes.push(`Team: ${before.team?.name ?? "Chưa chọn"} → ${updated.team?.name ?? "Chưa chọn"}`);
    }
    await logAudit({
      actorId: admin.id,
      action: "employee.update",
      targetType: "Employee",
      targetId: id,
      summary: `Sửa hồ sơ ${updated.code} - ${updated.name}${changes.length ? ` (${changes.join("; ")})` : ""}`,
    });
    refresh();
    return { ok: true, message: "Đã lưu thay đổi" };
  } catch (e) {
    if (e instanceof LeaderConflictError) return { confirmLeader: e.conflict };
    if (isUniqueError(e, "code")) return { error: `Mã NV ${data.code} đã tồn tại` };
    if (isUniqueError(e, "email")) return await emailConflictError(data.email, id);
    throw e;
  }
}

// ───────────────────── Tài khoản: mật khẩu, khóa, nghỉ việc, xóa ─────────────────────

export async function resetPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const id = String(fd.get("id") ?? "");
  const e = await prisma.employee.findUnique({ where: { id } });
  if (!e) return { error: "Không tìm thấy nhân sự" };
  if (e.id === admin.id) return { error: "Để đổi mật khẩu của chính bạn, dùng mục Đổi mật khẩu trong Hồ sơ cá nhân" };

  const tempPassword = generateTempPassword();
  await prisma.$transaction([
    prisma.employee.update({
      where: { id },
      data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true },
    }),
    prisma.session.deleteMany({ where: { employeeId: id } }),
  ]);
  if (e.email) clearFailuresForEmail(e.email);

  await logAudit({
    actorId: admin.id,
    action: "employee.reset_password",
    targetType: "Employee",
    targetId: id,
    summary: `Reset mật khẩu cho ${e.code} - ${e.name}`,
  });
  refresh();
  return { ok: true, tempPassword };
}

async function guardNotSelfOrLastAdmin(adminId: string, target: { id: string; role: string | null }) {
  if (target.id === adminId) return "Bạn không thể thực hiện thao tác này với tài khoản của chính mình";
  if (target.role === "ADMIN" && (await countActiveAdmins()) <= 1) return "Phải còn ít nhất 1 Admin hoạt động";
  return null;
}

export async function setLocked(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const id = String(fd.get("id") ?? "");
  const locked = fd.get("locked") === "1";
  const e = await prisma.employee.findUnique({ where: { id } });
  if (!e) return { error: "Không tìm thấy nhân sự" };
  if (locked) {
    const err = await guardNotSelfOrLastAdmin(admin.id, e);
    if (err) return { error: err };
  }

  await prisma.$transaction([
    prisma.employee.update({ where: { id }, data: { isLocked: locked } }),
    ...(locked ? [prisma.session.deleteMany({ where: { employeeId: id } })] : []),
  ]);
  if (!locked && e.email) clearFailuresForEmail(e.email);

  await logAudit({
    actorId: admin.id,
    action: locked ? "employee.lock" : "employee.unlock",
    targetType: "Employee",
    targetId: id,
    summary: `${locked ? "Khóa" : "Mở khóa"} tài khoản ${e.code} - ${e.name}`,
  });
  refresh();
  return { ok: true, message: locked ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản" };
}

export async function markResigned(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const id = String(fd.get("id") ?? "");
  const leftAt = fromDateInput(fd.get("leftAt"));
  if (!leftAt) return { error: "Vui lòng chọn ngày nghỉ việc" };
  const e = await prisma.employee.findUnique({ where: { id } });
  if (!e) return { error: "Không tìm thấy nhân sự" };
  const err = await guardNotSelfOrLastAdmin(admin.id, e);
  if (err) return { error: err };

  // Không khóa / không đăng xuất ngay: nhân sự đã nghỉ vẫn đăng nhập được, nhưng hệ thống tự ép chỉ
  // vào được /salary (xem phiếu lương cuối) — mọi quyền cũ (kể cả Leader/Admin) hết hiệu lực ngay.
  // Admin bấm "Khóa tài khoản" khi muốn chặn hẳn, hoặc "Xóa hẳn" sau khi đã trả lương xong.
  await prisma.$transaction([
    prisma.employee.update({ where: { id }, data: { status: "RESIGNED", leftAt, isCEO: false } }),
    prisma.team.updateMany({ where: { leaderId: id }, data: { leaderId: null } }),
  ]);
  // TODO (module Hanet): tự động gọi API Hanet xóa FaceID

  await logAudit({
    actorId: admin.id,
    action: "employee.resign",
    targetType: "Employee",
    targetId: id,
    summary: `Đánh dấu nghỉ việc ${e.code} - ${e.name}`,
  });
  refresh();
  return { ok: true, message: "Đã chuyển sang Đã nghỉ. Vẫn đăng nhập được để xem Lương, không thao tác gì khác." };
}

export async function reactivate(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const id = String(fd.get("id") ?? "");
  const e = await prisma.employee.update({
    where: { id },
    data: { status: "ACTIVE", leftAt: null, isLocked: false },
  });
  await logAudit({
    actorId: admin.id,
    action: "employee.reactivate",
    targetType: "Employee",
    targetId: id,
    summary: `Cho ${e.code} - ${e.name} đi làm lại`,
  });
  refresh();
  return { ok: true, message: "Đã chuyển về Đang làm" };
}

export async function deleteEmployee(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const id = String(fd.get("id") ?? "");
  const e = await prisma.employee.findUnique({ where: { id } });
  if (!e) return { error: "Không tìm thấy nhân sự" };
  const err = await guardNotSelfOrLastAdmin(admin.id, e);
  if (err) return { error: err };

  // Xóa hẳn: kéo theo công, đơn, phiếu lương, thưởng... của người này (spec §10: không cần giữ trên app)
  await prisma.employee.delete({ where: { id } });
  await logAudit({
    actorId: admin.id,
    action: "employee.delete",
    targetType: "Employee",
    targetId: id,
    summary: `Xóa hẳn nhân sự ${e.code} - ${e.name}`,
  });
  refresh();
  redirect("/admin/employees");
}

// ───────────────────────── Điều chỉnh phép năm (§4) ─────────────────────────

/** Admin cộng / trừ ngày phép năm của 1 nhân sự (kèm lý do) — giống sửa công. Cộng vào phép tích lũy của năm đó, tính cả vào phép tồn quy đổi ra lương. */
export async function addLeaveAdjustment(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const employeeId = String(fd.get("employeeId") ?? "");
  const year = Number(fd.get("year"));
  const days = Number(String(fd.get("days") ?? "").trim().replace(",", "."));
  const note = String(fd.get("note") ?? "").trim();

  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: "Năm không hợp lệ" };
  if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 60) return { error: "Nhập số ngày cộng (số dương) hoặc trừ (số âm), khác 0, tối đa 60 ngày" };
  if (!note) return { error: "Vui lòng nhập lý do điều chỉnh" };
  if (note.length > 200) return { error: "Lý do quá dài (tối đa 200 ký tự)" };

  const e = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!e) return { error: "Không tìm thấy nhân sự" };

  const rounded = Math.round(days * 100) / 100;
  await prisma.leaveAdjustment.create({ data: { employeeId, year, days: rounded, note, createdById: admin.id } });
  await logAudit({
    actorId: admin.id,
    action: "leave.adjust",
    targetType: "Employee",
    targetId: employeeId,
    summary: `Điều chỉnh phép năm ${year} của ${e.code} - ${e.name}: ${rounded > 0 ? "+" : ""}${rounded} ngày (${note})`,
  });
  refresh();
  revalidatePath("/requests");
  return { ok: true, message: `Đã điều chỉnh ${rounded > 0 ? "+" : ""}${rounded} ngày phép năm ${year}` };
}

export async function deleteLeaveAdjustment(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const id = String(fd.get("id") ?? "");
  const row = await prisma.leaveAdjustment.findUnique({ where: { id }, include: { employee: true } });
  if (!row) return { error: "Không tìm thấy điều chỉnh" };

  await prisma.leaveAdjustment.delete({ where: { id } });
  await logAudit({
    actorId: admin.id,
    action: "leave.adjust_delete",
    targetType: "Employee",
    targetId: row.employeeId,
    summary: `Xóa điều chỉnh phép năm ${row.year} của ${row.employee.code} - ${row.employee.name}: ${row.days > 0 ? "+" : ""}${row.days} ngày (${row.note})`,
  });
  refresh();
  revalidatePath("/requests");
  return { ok: true, message: "Đã xóa điều chỉnh" };
}

// ───────────────────────── Lịch sử lương (§6.2) ─────────────────────────

export async function addSalaryHistory(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const employeeId = String(fd.get("employeeId") ?? "");
  const baseSalary = parseMoney(fd.get("baseSalary"));
  const perfSalary = parseMoney(fd.get("perfSalary"));
  const effectiveFrom = fromDateInput(fd.get("effectiveFrom"));
  const note = String(fd.get("note") ?? "").trim() || null;

  if (baseSalary == null) return { error: "Vui lòng nhập lương base" };
  if (perfSalary == null) return { error: "Vui lòng nhập lương performance (nhập 0 nếu không có)" };
  if (!effectiveFrom) return { error: "Vui lòng chọn ngày hiệu lực" };

  const e = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!e) return { error: "Không tìm thấy nhân sự" };

  await prisma.salaryHistory.create({
    data: { employeeId, baseSalary, perfSalary, effectiveFrom, note, createdById: admin.id },
  });
  await logAudit({
    actorId: admin.id,
    action: "salary.add",
    targetType: "Employee",
    targetId: employeeId,
    summary: `Thêm mốc lương cho ${e.code} - ${e.name}: base ${baseSalary.toLocaleString("vi-VN")}, performance ${perfSalary.toLocaleString("vi-VN")}, từ ${fd.get("effectiveFrom")}`,
  });
  refresh();
  return { ok: true, message: "Đã thêm điều chỉnh lương" };
}

export async function deleteSalaryHistory(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const id = String(fd.get("id") ?? "");
  const row = await prisma.salaryHistory.findUnique({ where: { id }, include: { employee: true } });
  if (!row) return { error: "Không tìm thấy mốc lương" };

  await prisma.salaryHistory.delete({ where: { id } });
  await logAudit({
    actorId: admin.id,
    action: "salary.delete",
    targetType: "Employee",
    targetId: row.employeeId,
    summary: `Xóa mốc lương của ${row.employee.code} - ${row.employee.name}: base ${row.baseSalary.toLocaleString("vi-VN")}, performance ${row.perfSalary.toLocaleString("vi-VN")}, từ ${row.effectiveFrom.toISOString().slice(0, 10)}`,
  });
  refresh();
  return { ok: true, message: "Đã xóa mốc lương" };
}

// ───────────────────────── Team ─────────────────────────

const TeamSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên team").max(60, "Tên team tối đa 60 ký tự"),
  type: z.enum(["PRODUCTION", "SUPPORT"], { error: "Vui lòng chọn loại team" }),
});

const TEAM_TYPE_LABEL = { PRODUCTION: "Team sản xuất", SUPPORT: "Team hỗ trợ" } as const;

export async function createTeam(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const parsed = TeamSchema.safeParse({ name: fd.get("name") ?? "", type: fd.get("type") ?? undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const maxOrder = await prisma.team.aggregate({ _max: { sortOrder: true } });
    const team = await prisma.team.create({
      data: { ...parsed.data, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
    });
    await logAudit({
      actorId: admin.id,
      action: "team.create",
      targetType: "Team",
      targetId: team.id,
      summary: `Tạo ${TEAM_TYPE_LABEL[team.type]} "${team.name}"`,
    });
  } catch (e) {
    if (isUniqueError(e, "name")) return { error: `Đã có team tên "${parsed.data.name}"` };
    throw e;
  }
  refresh();
  return { ok: true, message: "Đã tạo team" };
}

export async function updateTeam(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const id = String(fd.get("id") ?? "");
  const parsed = TeamSchema.safeParse({ name: fd.get("name") ?? "", type: fd.get("type") ?? undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const before = await prisma.team.findUnique({ where: { id }, include: { displayLeader: { select: { name: true } } } });
  if (!before) return { error: "Không tìm thấy team" };

  // Leader hiển thị: chọn bất kỳ nhân sự đang làm (không cần thuộc team, không đổi quyền)
  const displayLeaderId = String(fd.get("displayLeaderId") ?? "") || null;
  const displayLeader = displayLeaderId
    ? await prisma.employee.findFirst({ where: { id: displayLeaderId, status: "ACTIVE" }, select: { name: true } })
    : null;
  if (displayLeaderId && !displayLeader) return { error: "Không tìm thấy nhân sự được chọn làm Leader hiển thị" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.team.update({ where: { id }, data: { ...parsed.data, displayLeaderId } });
      // Team hỗ trợ không được làm Team in-charge → gỡ khỏi các dự án đang in-charge
      if (parsed.data.type === "SUPPORT") {
        await tx.project.updateMany({ where: { inChargeTeamId: id }, data: { inChargeTeamId: null } });
      }
    });
  } catch (e) {
    if (isUniqueError(e, "name")) return { error: `Đã có team tên "${parsed.data.name}"` };
    throw e;
  }

  const changes: string[] = [];
  if (before.name !== parsed.data.name) changes.push(`tên "${before.name}" → "${parsed.data.name}"`);
  if (before.type !== parsed.data.type) {
    changes.push(`loại ${TEAM_TYPE_LABEL[before.type]} → ${TEAM_TYPE_LABEL[parsed.data.type]}`);
  }
  if (before.displayLeaderId !== displayLeaderId) {
    changes.push(`Leader hiển thị: ${before.displayLeader?.name ?? "trống"} → ${displayLeader?.name ?? "trống"}`);
  }
  if (changes.length) {
    await logAudit({
      actorId: admin.id,
      action: "team.update",
      targetType: "Team",
      targetId: id,
      summary: `Sửa team: ${changes.join(", ")}`,
    });
  }
  refresh();
  return { ok: true, message: "Đã lưu team" };
}

export async function deleteTeam(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const id = String(fd.get("id") ?? "");
  const team = await prisma.team.findUnique({ where: { id }, include: { _count: { select: { members: true } } } });
  if (!team) return { error: "Không tìm thấy team" };

  // Nhân sự trong team → "Chưa chọn"; dự án → "Chưa có team in-charge" (onDelete: SetNull)
  await prisma.team.delete({ where: { id } });
  await logAudit({
    actorId: admin.id,
    action: "team.delete",
    targetType: "Team",
    targetId: id,
    summary: `Xóa team "${team.name}" (${team._count.members} nhân sự chuyển về Chưa chọn)`,
  });
  refresh();
  return { ok: true, message: `Đã xóa team "${team.name}"` };
}

export async function removeFromTeam(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const id = String(fd.get("id") ?? "");
  const e = await prisma.employee.findUnique({ where: { id }, include: { team: true } });
  if (!e?.team) return { error: "Nhân sự không thuộc team nào" };

  await prisma.$transaction([
    prisma.employee.update({ where: { id }, data: { teamId: null } }),
    prisma.team.updateMany({ where: { leaderId: id }, data: { leaderId: null } }),
  ]);
  await logAudit({
    actorId: admin.id,
    action: "employee.update",
    targetType: "Employee",
    targetId: id,
    summary: `Gỡ ${e.code} - ${e.name} khỏi team "${e.team.name}"`,
  });
  refresh();
  return { ok: true };
}

/** Thêm 1 nhân sự ĐÃ CÓ trong công ty vào team (từ Sơ đồ tổ chức). Tạo người mới thì dùng /admin/employees/new. */
export async function assignToTeam(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const employeeId = String(fd.get("employeeId") ?? "");
  const teamId = String(fd.get("teamId") ?? "");
  if (!employeeId) return { error: "Vui lòng chọn nhân sự" };

  const [e, team] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, include: { team: true } }),
    prisma.team.findUnique({ where: { id: teamId } }),
  ]);
  if (!e) return { error: "Không tìm thấy nhân sự" };
  if (!team) return { error: "Không tìm thấy team" };
  if (e.teamId === teamId) return { error: `${e.name} đã ở trong team này` };

  await prisma.$transaction([
    prisma.employee.update({ where: { id: employeeId }, data: { teamId } }),
    // Không còn thuộc team cũ thì cũng không nên đứng tên Leader team cũ nữa
    prisma.team.updateMany({ where: { leaderId: employeeId, NOT: { id: teamId } }, data: { leaderId: null } }),
  ]);
  await logAudit({
    actorId: admin.id,
    action: "employee.update",
    targetType: "Employee",
    targetId: employeeId,
    summary: `Thêm ${e.code} - ${e.name} vào team "${team.name}"${e.team ? ` (chuyển từ "${e.team.name}")` : ""}`,
  });
  refresh();
  return { ok: true, message: `Đã thêm ${e.name} vào team ${team.name}` };
}

// ───────────────────────── Ảnh nhân sự ─────────────────────────

const MAX_PHOTO_BYTES = 2.5 * 1024 * 1024;

/** Nhận diện định dạng ảnh qua mấy byte đầu file (không tin phần đuôi tên file). */
function detectImageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function uploadPhoto(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const employeeId = String(fd.get("employeeId") ?? "");
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Vui lòng chọn ảnh" };
  if (file.size > MAX_PHOTO_BYTES) return { error: "Ảnh quá lớn (tối đa 2,5MB sau khi thu nhỏ)" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectImageType(bytes);
  if (!mimeType) return { error: "File không phải ảnh JPG / PNG / WebP" };

  const e = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!e) return { error: "Không tìm thấy nhân sự" };

  await prisma.employeePhoto.upsert({
    where: { employeeId },
    update: { data: bytes, mimeType },
    create: { employeeId, data: bytes, mimeType },
  });
  // TODO (module Hanet): tự động gọi API Hanet đăng ký / cập nhật FaceID, MSNV = Mã NV
  await logAudit({
    actorId: admin.id,
    action: "employee.photo_upload",
    targetType: "Employee",
    targetId: employeeId,
    summary: `Cập nhật ảnh FaceID cho ${e.code} - ${e.name}`,
  });
  refresh();
  revalidatePath("/profile");
  return { ok: true, message: "Đã lưu ảnh" };
}

export async function deletePhoto(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const employeeId = String(fd.get("employeeId") ?? "");
  const e = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!e) return { error: "Không tìm thấy nhân sự" };

  await prisma.employeePhoto.deleteMany({ where: { employeeId } });
  await logAudit({
    actorId: admin.id,
    action: "employee.photo_delete",
    targetType: "Employee",
    targetId: employeeId,
    summary: `Xóa ảnh FaceID của ${e.code} - ${e.name}`,
  });
  refresh();
  revalidatePath("/profile");
  return { ok: true, message: "Đã xóa ảnh" };
}
