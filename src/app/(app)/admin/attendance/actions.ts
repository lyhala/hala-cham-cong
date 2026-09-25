"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/session";
import { calcForDay, refreshDailyAttendance } from "@/lib/attendance";
import { prisma } from "@/lib/db";
import { timeVN } from "@/lib/dates";

// Server action là API công khai: luôn requireRole("ADMIN") trước tiên, không dựa vào việc chỉ Admin thấy nút.

export type AttendanceActionState = { ok?: boolean; error?: string; message?: string } | undefined;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ").or(z.literal(""));

const SaveSchema = z.object({
  employeeId: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkIn: time,
  checkOut: time,
  workUnits: z.string().trim(), // Trống = tự tính từ giờ vào/ra
  note: z.string().trim().max(300),
});

function refresh() {
  revalidatePath("/admin/attendance");
  revalidatePath("/attendance");
}

const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+07:00`);
const fmtTime = (d: Date | null) => (d ? timeVN(d) : "—");

/** Admin sửa trực tiếp giờ vào/ra (và số công nếu muốn) của 1 ngày. Ngày đã sửa tay thì Hanet không ghi đè nữa. */
export async function saveAttendanceDay(_prev: AttendanceActionState, fd: FormData): Promise<AttendanceActionState> {
  const admin = await requireRole("ADMIN");
  const parsed = SaveSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const { employeeId, day, note } = parsed.data;

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { code: true, name: true } });
  if (!employee) return { error: "Không tìm thấy nhân sự" };

  const checkIn = parsed.data.checkIn ? at(day, parsed.data.checkIn) : null;
  const checkOut = parsed.data.checkOut ? at(day, parsed.data.checkOut) : null;
  if (checkOut && !checkIn) return { error: "Có giờ ra thì phải có giờ vào" };
  if (checkIn && checkOut && checkOut <= checkIn) return { error: "Giờ ra phải sau giờ vào" };

  const calc = await calcForDay(employeeId, day, checkIn, checkOut);
  if (parsed.data.workUnits) {
    const units = Number(parsed.data.workUnits.replace(",", "."));
    if (!Number.isFinite(units) || units < 0 || units > 1) return { error: "Số công phải từ 0 đến 1" };
    calc.workUnits = Math.round(units * 100) / 100;
  }

  const date = new Date(`${day}T00:00:00Z`);
  const before = await prisma.dailyAttendance.findUnique({ where: { employeeId_date: { employeeId, date } } });
  await prisma.dailyAttendance.upsert({
    where: { employeeId_date: { employeeId, date } },
    create: { employeeId, date, checkIn, checkOut, isManual: true, note: note || null, ...calc },
    update: { checkIn, checkOut, isManual: true, note: note || null, ...calc },
  });

  await logAudit({
    actorId: admin.id,
    action: "attendance.edit",
    targetType: "DailyAttendance",
    targetId: `${employeeId}:${day}`,
    summary: `Sửa công ${employee.name} (${employee.code}) ngày ${day}: vào ${fmtTime(before?.checkIn ?? null)}→${fmtTime(checkIn)}, ra ${fmtTime(before?.checkOut ?? null)}→${fmtTime(checkOut)}, công ${before?.workUnits ?? 0}→${calc.workUnits}${note ? `, ghi chú: ${note}` : ""}`,
  });
  refresh();
  return { ok: true, message: "Đã lưu" };
}

/** Bỏ chỉnh sửa tay: xóa dòng công của ngày rồi dựng lại từ log Hanet (không có log thì ngày đó trống). */
export async function resetAttendanceDay(_prev: AttendanceActionState, fd: FormData): Promise<AttendanceActionState> {
  const admin = await requireRole("ADMIN");
  const employeeId = String(fd.get("employeeId") ?? "");
  const day = String(fd.get("day") ?? "");
  if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Dữ liệu không hợp lệ" };

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { code: true, name: true } });
  if (!employee) return { error: "Không tìm thấy nhân sự" };

  await prisma.dailyAttendance.deleteMany({ where: { employeeId, date: new Date(`${day}T00:00:00Z`) } });
  await refreshDailyAttendance(employeeId, day);

  await logAudit({
    actorId: admin.id,
    action: "attendance.reset",
    targetType: "DailyAttendance",
    targetId: `${employeeId}:${day}`,
    summary: `Bỏ sửa tay, tính lại từ dữ liệu Hanet: ${employee.name} (${employee.code}) ngày ${day}`,
  });
  refresh();
  return { ok: true, message: "Đã tính lại từ dữ liệu Hanet" };
}
