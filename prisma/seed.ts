// Dữ liệu khởi tạo: 5 team, 8 tiêu chí performance, cấu hình mặc định, tài khoản Admin đầu tiên.
// Chạy nhiều lần vẫn an toàn — chỉ tạo cái còn thiếu, không ghi đè dữ liệu đã có.
//
//   npm run db:seed                 → dữ liệu khởi tạo
//   SEED_DEMO=1 npm run db:seed     → thêm 1 Leader + 1 Nhân viên mẫu để thử đăng nhập
//
// Đặt lại mật khẩu Admin (khi quên / mất mật khẩu tạm): thêm biến ADMIN_RESET_PASSWORD="<mật khẩu tạm mới>"
// rồi deploy lại. Mỗi giá trị chỉ áp dụng 1 lần (restart sau đó không đặt lại nữa). Xong nên xóa biến.
import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { generateTempPassword, hashPassword } from "../src/lib/auth/password";
import { SETTING_DEFAULTS } from "../src/lib/settings";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const TEAMS = [
  { name: "Tuấn Anh", type: "PRODUCTION" },
  { name: "Joe", type: "PRODUCTION" },
  { name: "Marketing", type: "SUPPORT" },
  { name: "R&D", type: "SUPPORT" },
  { name: "HCNS", type: "SUPPORT" },
] as const;

const CRITERIA = [
  { group: "BASE", name: "Hoàn thành CV đúng, đủ, kịp deadline", weight: 30 },
  { group: "BASE", name: "Tuân thủ nội quy", weight: 5 },
  { group: "BASE", name: "Teamwork, Kết nối tốt", weight: 7 },
  { group: "BASE", name: "Chủ động, Trách nhiệm", weight: 8 },
  { group: "OUT", name: "Hoàn thành CV chất lượng vượt kỳ vọng", weight: 15 },
  { group: "OUT", name: "Hoàn thành vượt deadline/kịp deadline gấp", weight: 15 },
  { group: "OUT", name: "Đề xuất/thực thi ý tưởng/CV mới", weight: 15 },
  { group: "OUT", name: "Cải thiện chuyên môn", weight: 5 },
] as const;

async function createEmployeeIfMissing(data: {
  code: string;
  name: string;
  email: string;
  role: "EMPLOYEE" | "LEADER" | "ADMIN";
  teamName?: string;
  password?: string;
}) {
  const existing = await prisma.employee.findFirst({ where: { OR: [{ code: data.code }, { email: data.email }] } });
  if (existing) return { employee: existing, created: false, password: null };

  const team = data.teamName ? await prisma.team.findUnique({ where: { name: data.teamName } }) : null;
  const password = data.password || generateTempPassword();
  const employee = await prisma.employee.create({
    data: {
      code: data.code,
      name: data.name,
      email: data.email.toLowerCase(),
      role: data.role,
      teamId: team?.id,
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    },
  });
  return { employee, created: true, password };
}

// Đặt lại mật khẩu Admin theo biến ADMIN_RESET_PASSWORD. Lưu dấu (hash) giá trị đã áp dụng
// để các lần khởi động sau không đặt lại nữa → Admin đổi mật khẩu xong sẽ không bị ghi đè.
async function resetAdminPasswordIfRequested(adminEmail: string) {
  const newPassword = process.env.ADMIN_RESET_PASSWORD;
  if (!newPassword) return;

  const marker = createHash("sha256").update(`${adminEmail.toLowerCase()}|${newPassword}`).digest("hex");
  const MARKER_KEY = "system.adminPasswordResetMarker";
  const applied = await prisma.setting.findUnique({ where: { key: MARKER_KEY } });
  if ((applied?.value as { marker?: string } | null)?.marker === marker) {
    console.log("• ADMIN_RESET_PASSWORD đã áp dụng trước đó — bỏ qua. Có thể xóa biến này.");
    return;
  }

  const admin = await prisma.employee.findUnique({ where: { email: adminEmail.toLowerCase() } });
  if (!admin) {
    console.log(`✗ Không tìm thấy tài khoản ${adminEmail} để đặt lại mật khẩu`);
    return;
  }

  await prisma.employee.update({
    where: { id: admin.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: true,
      isLocked: false,
      status: "ACTIVE",
      role: "ADMIN",
    },
  });
  await prisma.session.deleteMany({ where: { employeeId: admin.id } });
  await prisma.setting.upsert({
    where: { key: MARKER_KEY },
    update: { value: { marker } },
    create: { key: MARKER_KEY, value: { marker } },
  });
  await prisma.auditLog.create({
    data: { actorId: null, action: "auth.admin_password_reset", summary: `Đặt lại mật khẩu Admin ${adminEmail} qua biến môi trường` },
  });
  console.log(`✓ Đã đặt lại mật khẩu Admin ${adminEmail} theo biến ADMIN_RESET_PASSWORD (bắt đổi khi đăng nhập). Nên xóa biến này.`);
}

async function main() {
  // Team mẫu chỉ tạo 1 lần khi database còn trống. Sau đó Admin tự tạo / đổi tên / xóa team,
  // khởi động lại không tạo lại team đã bị đổi tên hay xóa.
  if ((await prisma.team.count()) === 0) {
    await prisma.team.createMany({ data: TEAMS.map((t, i) => ({ ...t, sortOrder: i })) });
    console.log(`✓ Tạo ${TEAMS.length} team mẫu`);
  } else {
    console.log("✓ Team đã có");
  }

  if ((await prisma.performanceCriterion.count()) === 0) {
    await prisma.performanceCriterion.createMany({ data: CRITERIA.map((c, i) => ({ ...c, sortOrder: i })) });
  }
  console.log("✓ Tiêu chí performance");

  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: value as Prisma.InputJsonValue } });
  }
  console.log("✓ Cấu hình mặc định");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) throw new Error("Thiếu biến môi trường ADMIN_EMAIL (email của tài khoản Admin đầu tiên)");
  const admin = await createEmployeeIfMissing({
    code: "ADM",
    name: process.env.ADMIN_NAME ?? "Admin",
    email: adminEmail,
    role: "ADMIN",
    password: process.env.ADMIN_INITIAL_PASSWORD,
  });
  if (!admin.created) {
    console.log(`✓ Admin đã có: ${admin.employee.email}`);
  } else if (process.env.ADMIN_INITIAL_PASSWORD) {
    console.log(`✓ Tạo Admin: ${adminEmail} / mật khẩu tạm: theo biến ADMIN_INITIAL_PASSWORD (bắt đổi lần đầu)`);
  } else {
    console.log(`✓ Tạo Admin: ${adminEmail} / mật khẩu tạm: ${admin.password} (bắt đổi lần đầu)`);
  }

  await resetAdminPasswordIfRequested(adminEmail);

  if (process.env.SEED_DEMO === "1") {
    const leader = await createEmployeeIfMissing({
      code: "NV002", name: "Trần Trung Kiên", email: "leader.demo@example.com", role: "LEADER", teamName: "Joe",
    });
    await prisma.team.updateMany({ where: { name: "Joe", leaderId: null }, data: { leaderId: leader.employee.id } });
    const emp = await createEmployeeIfMissing({
      code: "NV001", name: "Ninh Thành Vinh", email: "nhanvien.demo@example.com", role: "EMPLOYEE", teamName: "Joe",
    });
    for (const r of [leader, emp]) {
      if (r.created) console.log(`✓ Demo: ${r.employee.email} / ${r.password}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
