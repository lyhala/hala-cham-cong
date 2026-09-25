// Xóa dữ liệu quá hạn theo chính sách lưu trữ (spec §17). Chạy hằng ngày bằng cron.
//   npm run retention -- --dry-run   → chỉ đếm số dòng sẽ bị xóa, không xóa gì
//   npm run retention                → xóa thật
//
// Trên Railway: tạo 1 Cron Service riêng (cùng repo, cùng biến DATABASE_URL), lệnh `npm run retention`,
// lịch `0 19 * * *` (19:00 UTC = 02:00 sáng giờ VN).

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { runRetention } from "../src/lib/retention";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const dryRun = process.argv.includes("--dry-run");

try {
  const { result, cutoffs } = await runRetention(prisma, { dryRun });
  console.log(dryRun ? "[CHẠY THỬ — chưa xóa gì]" : "[ĐÃ XÓA]");
  console.log(`Phiếu lương trước tháng ${cutoffs.payslipMonth}: ${result.payslips}`);
  console.log(`Công bù trước tháng ${cutoffs.payslipMonth}: ${result.unitBonuses}`);
  console.log(`Log Hanet trước ${cutoffs.attendanceMonth}-01: ${result.attendanceLogs}`);
  console.log(`Bảng công ngày trước ${cutoffs.attendanceMonth}-01: ${result.dailyAttendance}`);
  console.log(`Hệ số phân bổ trước tháng ${cutoffs.allocationMonth}: ${result.allocations}`);
  console.log(`Đơn từ trước ${cutoffs.requestMonth}-01: ${result.requests}`);
} finally {
  await prisma.$disconnect();
}
