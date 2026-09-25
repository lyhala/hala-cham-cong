import "server-only";

import { prisma } from "@/lib/db";
import { todayVN } from "@/lib/dates";
import { calcDay, isWorkday, pickExemptDays } from "@/lib/attendance-rules";
import { getSetting } from "@/lib/settings-db";

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
  const calc = await calcForDay(employeeId, day, first.time, checkOut);
  return prisma.dailyAttendance.upsert({
    where: { employeeId_date: { employeeId, date } },
    create: { employeeId, date, checkIn: first.time, checkOut, ...calc },
    update: { checkIn: first.time, checkOut, ...calc },
  });
}

/** Tính công + phạt của 1 ngày theo lịch làm việc và cấu hình hiện tại (§3.2, §3.3). */
async function calcForDay(employeeId: string, day: string, checkIn: Date | null, checkOut: Date | null) {
  const [schedule, penaltyConfig, override, employee, excusedDays] = await Promise.all([
    getSetting("workSchedule"),
    getSetting("latePenalty"),
    prisma.workCalendarDay.findUnique({ where: { date: new Date(`${day}T00:00:00Z`) } }),
    prisma.employee.findUnique({ where: { id: employeeId }, select: { attendanceExempt: true } }),
    lateExcusedDays(employeeId, day.slice(0, 7)),
  ]);
  return calcDay(
    {
      checkIn,
      checkOut,
      workday: isWorkday(day, schedule, override),
      exempt: employee?.attendanceExempt ?? false,
      lateExcused: excusedDays.has(day),
    },
    schedule,
    penaltyConfig,
  );
}

/**
 * Các ngày đi muộn được miễn của 1 nhân sự trong tháng (§3.3): đơn ĐI MUỘN đã duyệt xong, chưa bị xóa,
 * lấy đúng số suất miễn/tháng có ngày đi muộn sớm nhất.
 */
async function lateExcusedDays(employeeId: string, month: string) {
  const [y, m] = month.split("-").map(Number);
  const [config, requests] = await Promise.all([
    getSetting("latePenalty"),
    prisma.request.findMany({
      where: {
        employeeId,
        type: "LATE",
        status: "APPROVED",
        deletedAt: null,
        dateFrom: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) },
      },
      select: { dateFrom: true },
    }),
  ]);
  const days = requests.flatMap((r) => (r.dateFrom ? [r.dateFrom.toISOString().slice(0, 10)] : []));
  return pickExemptDays(days, config.freeExemptionsPerMonth);
}

/**
 * Tính lại công 1 nhân sự trong 1 tháng — gọi sau khi đơn đi muộn được duyệt / bị xóa,
 * vì suất miễn phạt có thể dồn sang đơn khác.
 */
export async function recalcEmployeeMonth(employeeId: string, month: string) {
  const [y, m] = month.split("-").map(Number);
  const rows = await prisma.dailyAttendance.findMany({
    where: { employeeId, isManual: false, date: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } },
  });
  for (const row of rows) {
    const calc = await calcForDay(row.employeeId, row.date.toISOString().slice(0, 10), row.checkIn, row.checkOut);
    await prisma.dailyAttendance.update({ where: { id: row.id }, data: calc });
  }
}

/**
 * Tính lại toàn bộ bảng công 1 tháng ("YYYY-MM") từ checkin/checkout đang lưu — dùng khi đổi lịch làm việc,
 * bảng phạt, hoặc cờ miễn chấm công. Bỏ qua các ngày đã sửa tay.
 */
export async function recalcMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const rows = await prisma.dailyAttendance.findMany({
    where: { isManual: false, date: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } },
  });
  for (const row of rows) {
    const calc = await calcForDay(row.employeeId, row.date.toISOString().slice(0, 10), row.checkIn, row.checkOut);
    await prisma.dailyAttendance.update({ where: { id: row.id }, data: calc });
  }
  return rows.length;
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
