import "server-only";

import { prisma } from "@/lib/db";
import { todayVN } from "@/lib/dates";

/** Khoảng [00:00, 24:00) theo giờ VN của 1 ngày "YYYY-MM-DD", dạng mốc UTC. */
function vnDayRange(day: string) {
  const start = new Date(`${day}T00:00:00+07:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * Cập nhật bảng công ngày từ log thô (§3.2): Checkin = log đầu tiên, Checkout = log cuối cùng trong ngày.
 * Ngày Admin/Leader đã sửa tay (isManual) thì giữ nguyên, không ghi đè.
 */
export async function refreshDailyAttendance(employeeId: string, day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  const existing = await prisma.dailyAttendance.findUnique({ where: { employeeId_date: { employeeId, date } } });
  if (existing?.isManual) return existing;

  const { start, end } = vnDayRange(day);
  const range = { employeeId, time: { gte: start, lt: end } };
  const [first, last] = await Promise.all([
    prisma.attendanceLog.findFirst({ where: range, orderBy: { time: "asc" }, select: { time: true } }),
    prisma.attendanceLog.findFirst({ where: range, orderBy: { time: "desc" }, select: { time: true } }),
  ]);
  if (!first || !last) return existing;

  // Chỉ có 1 lần quét trong ngày → chưa có checkout
  const checkOut = last.time.getTime() === first.time.getTime() ? null : last.time;
  return prisma.dailyAttendance.upsert({
    where: { employeeId_date: { employeeId, date } },
    create: { employeeId, date, checkIn: first.time, checkOut },
    update: { checkIn: first.time, checkOut },
  });
}

export type HanetLogInput = {
  hanetPersonId: string;
  deviceId: string | null;
  time: Date;
  imageUrl: string | null;
  raw: unknown;
};

/** Ghi 1 log quét mặt từ Hanet (bỏ qua nếu trùng do Hanet gửi lại) rồi cập nhật bảng công ngày. */
export async function recordHanetLog(input: HanetLogInput) {
  const duplicate = await prisma.attendanceLog.findFirst({
    where: { hanetPersonId: input.hanetPersonId, time: input.time, deviceId: input.deviceId },
    select: { id: true },
  });
  if (duplicate) return { status: "duplicate" as const };

  const employee = await prisma.employee.findUnique({
    where: { hanetPersonId: input.hanetPersonId },
    select: { id: true },
  });

  await prisma.attendanceLog.create({
    data: {
      employeeId: employee?.id ?? null,
      hanetPersonId: input.hanetPersonId,
      deviceId: input.deviceId,
      time: input.time,
      imageUrl: input.imageUrl,
      raw: input.raw as object,
    },
  });

  if (!employee) return { status: "unmapped" as const };
  await refreshDailyAttendance(employee.id, todayVN(input.time));
  return { status: "recorded" as const };
}
