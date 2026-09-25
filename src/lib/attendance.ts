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
export async function calcForDay(employeeId: string, day: string, checkIn: Date | null, checkOut: Date | null) {
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
export async function lateExcusedDays(employeeId: string, month: string) {
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

// ───────────────────────── Đọc dữ liệu để hiển thị ─────────────────────────

const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)), lastDay: new Date(Date.UTC(y, m, 0)).getUTCDate() };
};

/** Lịch làm việc của tháng: mỗi ngày có phải ngày làm không (T2–T6 + ngày ngoại lệ trong WorkCalendarDay). */
async function loadMonthCalendar(month: string) {
  const { gte, lt, lastDay } = monthRange(month);
  const [schedule, overrides] = await Promise.all([
    getSetting("workSchedule"),
    prisma.workCalendarDay.findMany({ where: { date: { gte, lt } } }),
  ]);
  const byDay = new Map(overrides.map((o) => [o.date.toISOString().slice(0, 10), o]));
  const days = Array.from({ length: lastDay }, (_, i) => {
    const day = `${month}-${String(i + 1).padStart(2, "0")}`;
    const override = byDay.get(day) ?? null;
    return { day, workday: isWorkday(day, schedule, override), isHoliday: override?.isHoliday ?? false, note: override?.note ?? null };
  });
  return { days, standardDays: days.filter((d) => d.workday).length };
}

export type DayStatus = "ok" | "warn" | "absent" | "off" | "future";

export type DayView = {
  day: string; // "YYYY-MM-DD"
  workday: boolean;
  isHoliday: boolean;
  calendarNote: string | null;
  checkIn: Date | null;
  checkOut: Date | null;
  workUnits: number;
  lateMinutes: number;
  latePenalty: number;
  halfDayDeducted: boolean;
  lateExcused: boolean; // Có đơn đi muộn được miễn → tiền phạt không bị trừ
  isManual: boolean;
  note: string | null;
  status: DayStatus;
};

/** Bảng công 1 tháng của 1 nhân sự (mọi ngày trong tháng) + tổng hợp. */
export async function getMonthAttendance(employeeId: string, month: string) {
  const { gte, lt } = monthRange(month);
  const [calendar, rows, excused, employee] = await Promise.all([
    loadMonthCalendar(month),
    prisma.dailyAttendance.findMany({ where: { employeeId, date: { gte, lt } } }),
    lateExcusedDays(employeeId, month),
    prisma.employee.findUnique({ where: { id: employeeId }, select: { attendanceExempt: true } }),
  ]);
  const exempt = employee?.attendanceExempt ?? false;
  const byDay = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));
  const today = todayVN();

  const days: DayView[] = calendar.days.map((c) => {
    const r = byDay.get(c.day);
    const lateExcused = excused.has(c.day);
    // Miễn chấm công: mọi ngày làm việc (đã tới) tự đủ 1 công, bỏ qua dữ liệu Hanet
    const workUnits = c.workday && exempt && c.day <= today ? 1 : (r?.workUnits ?? 0);
    let status: DayStatus;
    if (!c.workday) status = "off";
    else if (c.day > today) status = "future";
    else if (exempt) status = "ok";
    else if (!r?.checkIn) status = "absent";
    else if (workUnits >= 1 && r.lateMinutes === 0) status = "ok";
    else status = "warn";
    return {
      day: c.day,
      workday: c.workday,
      isHoliday: c.isHoliday,
      calendarNote: c.note,
      checkIn: r?.checkIn ?? null,
      checkOut: r?.checkOut ?? null,
      workUnits,
      lateMinutes: r?.lateMinutes ?? 0,
      latePenalty: r?.latePenalty ?? 0,
      halfDayDeducted: r?.halfDayDeducted ?? false,
      lateExcused,
      isManual: r?.isManual ?? false,
      note: r?.note ?? null,
      status,
    };
  });

  return { days, exempt, totals: summarizeDays(days, calendar.standardDays) };
}

function summarizeDays(days: DayView[], standardDays: number) {
  return {
    standardDays,
    workUnits: Math.round(days.reduce((s, d) => s + d.workUnits, 0) * 100) / 100,
    lateDays: days.filter((d) => d.lateMinutes > 0).length,
    lateMinutes: days.reduce((s, d) => s + d.lateMinutes, 0),
    // Tiền phạt sau khi trừ các ngày được miễn (§3.3)
    latePenalty: days.reduce((s, d) => (d.lateExcused ? s : s + d.latePenalty), 0),
  };
}

/** Tổng hợp công tháng của mọi nhân sự đang làm — cho bảng tổng quan của Admin. */
export async function getMonthSummaries(month: string) {
  const { gte, lt } = monthRange(month);
  const [calendar, employees, rows, requests, config] = await Promise.all([
    loadMonthCalendar(month),
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, attendanceExempt: true, team: { select: { name: true } } },
    }),
    prisma.dailyAttendance.findMany({
      where: { date: { gte, lt } },
      select: { employeeId: true, date: true, workUnits: true, lateMinutes: true, latePenalty: true },
    }),
    prisma.request.findMany({
      where: { type: "LATE", status: "APPROVED", deletedAt: null, dateFrom: { gte, lt } },
      select: { employeeId: true, dateFrom: true },
    }),
    getSetting("latePenalty"),
  ]);

  const requestDays = new Map<string, string[]>();
  for (const r of requests) {
    if (r.dateFrom) requestDays.set(r.employeeId, [...(requestDays.get(r.employeeId) ?? []), r.dateFrom.toISOString().slice(0, 10)]);
  }
  const today = todayVN();
  const elapsedWorkdays = calendar.days.filter((d) => d.workday && d.day <= today).length;

  return {
    standardDays: calendar.standardDays,
    rows: employees.map((e) => {
      const mine = rows.filter((r) => r.employeeId === e.id);
      const excused = pickExemptDays(requestDays.get(e.id) ?? [], config.freeExemptionsPerMonth);
      return {
        id: e.id,
        code: e.code,
        name: e.name,
        team: e.team?.name ?? null,
        exempt: e.attendanceExempt,
        workUnits: e.attendanceExempt ? elapsedWorkdays : Math.round(mine.reduce((s, r) => s + r.workUnits, 0) * 100) / 100,
        lateDays: mine.filter((r) => r.lateMinutes > 0).length,
        latePenalty: mine.reduce((s, r) => (excused.has(r.date.toISOString().slice(0, 10)) ? s : s + r.latePenalty), 0),
      };
    }),
  };
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
