// In bảng công (DailyAttendance) của 1 nhân sự để đối chiếu sau khi chạy sim:hanet.
//   npm run show:attendance -- NV001 [YYYY-MM]

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const code = (process.argv[2] ?? "NV001").toUpperCase();
const month = process.argv[3] ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()).slice(0, 7);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const hm = (d: Date | null) => (d ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).format(d) : "  —  ");

const employee = await prisma.employee.findUnique({ where: { code }, select: { id: true, name: true, hanetPersonId: true } });
if (!employee) throw new Error(`Không có nhân sự ${code}`);
const [y, m] = month.split("-").map(Number);
const rows = await prisma.dailyAttendance.findMany({
  where: { employeeId: employee.id, date: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } },
  orderBy: { date: "asc" },
});
const logs = await prisma.attendanceLog.count({ where: { employeeId: employee.id } });

console.log(`${code} ${employee.name} — personID Hanet: ${employee.hanetPersonId ?? "chưa gắn"} — ${logs} log thô\n`);
console.log("Ngày        Vào    Ra     Công  Muộn(p)  Phạt(đ)  Trừ½");
for (const r of rows) {
  console.log(
    `${r.date.toISOString().slice(0, 10)}  ${hm(r.checkIn)}  ${hm(r.checkOut)}  ${String(r.workUnits).padEnd(5)} ${String(r.lateMinutes).padEnd(8)} ${String(r.latePenalty).padEnd(8)} ${r.halfDayDeducted ? "có" : "—"}${r.isManual ? "  (sửa tay)" : ""}`,
  );
}
await prisma.$disconnect();
