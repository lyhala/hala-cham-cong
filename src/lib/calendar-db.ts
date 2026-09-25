import "server-only";

import { recalcMonth } from "@/lib/attendance";
import { prisma } from "@/lib/db";
import { daysInRange } from "@/lib/requests";

// Ngày ngoại lệ so với lịch T2–T6 (bảng WorkCalendarDay): nghỉ lễ, nghỉ bù, đi làm bù (VD thứ 7).
export const CALENDAR_KINDS = {
  WORK: { isWorkday: true, isHoliday: false }, // Đi làm bù
  OFF: { isWorkday: false, isHoliday: false }, // Nghỉ (nghỉ bù...)
  HOLIDAY: { isWorkday: false, isHoliday: true }, // Nghỉ lễ tết (OT hệ số 3x)
} as const;

export type CalendarKind = keyof typeof CALENDAR_KINDS;
export const MAX_RANGE_DAYS = 62;

/** Đặt cả 1 dải ngày [from, to] (gồm 2 đầu) là ngoại lệ cùng loại rồi tính lại công các tháng bị ảnh hưởng. */
export async function setCalendarRange(from: string, to: string, kind: CalendarKind, note: string | null) {
  const days = daysInRange(from, to);
  if (days.length > MAX_RANGE_DAYS) throw new Error(`Dải ngày quá dài (tối đa ${MAX_RANGE_DAYS} ngày một lần)`);
  await prisma.$transaction(
    days.map((day) => {
      const date = new Date(`${day}T00:00:00Z`);
      return prisma.workCalendarDay.upsert({ where: { date }, create: { date, ...CALENDAR_KINDS[kind], note }, update: { ...CALENDAR_KINDS[kind], note } });
    }),
  );
  return { days: days.length, recalculated: await recalcMonths(days) };
}

/** Bỏ ngoại lệ của cả dải [from, to] (về lịch mặc định) rồi tính lại công. */
export async function clearCalendarRange(from: string, to: string) {
  const removed = await prisma.workCalendarDay.deleteMany({ where: { date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } } });
  return { removed: removed.count, recalculated: await recalcMonths(daysInRange(from, to)) };
}

async function recalcMonths(days: string[]) {
  let total = 0;
  for (const month of new Set(days.map((d) => d.slice(0, 7)))) total += await recalcMonth(month);
  return total;
}
