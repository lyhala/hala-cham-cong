// Dọn dữ liệu do sim:hanet tạo: log + bảng công của nhân sự thử, và gỡ personID giả "SIM-..." khỏi hồ sơ.
// Chỉ đụng tới log có personID bắt đầu bằng "SIM-" và nhân sự đang gắn personID giả đó; dữ liệu Hanet thật không bị xóa.
//   npm run sim:clear

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const simEmployees = await prisma.employee.findMany({ where: { hanetPersonId: { startsWith: "SIM-" } }, select: { id: true, code: true } });
const ids = simEmployees.map((e) => e.id);

const logs = await prisma.attendanceLog.deleteMany({ where: { hanetPersonId: { startsWith: "SIM-" } } });
const days = await prisma.dailyAttendance.deleteMany({ where: { employeeId: { in: ids } } });
await prisma.employee.updateMany({ where: { id: { in: ids } }, data: { hanetPersonId: null } });

console.log(`Đã xóa ${logs.count} log, ${days.count} dòng bảng công; gỡ personID giả của: ${simEmployees.map((e) => e.code).join(", ") || "(không có)"}`);
await prisma.$disconnect();
