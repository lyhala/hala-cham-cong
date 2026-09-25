"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/session";
import { isValidMonth } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { calculateMonth, sendPayslips } from "@/lib/payroll-db";

// Server action là API công khai: luôn requireRole("ADMIN") trước tiên.

export type PayrollActionState = { ok?: boolean; error?: string; message?: string } | undefined;

function refresh() {
  revalidatePath("/admin/payroll");
  revalidatePath("/salary");
}

function parse(fd: FormData) {
  const month = String(fd.get("month") ?? "");
  const employeeId = String(fd.get("employeeId") ?? "") || undefined;
  return { month, employeeId };
}

/** "Tính lương" (cả tháng) hoặc "Tính lại" (1 người). Dùng lại được nhiều lần — kết quả cuối cùng ghi đè. */
export async function calculatePayroll(_prev: PayrollActionState, fd: FormData): Promise<PayrollActionState> {
  const admin = await requireRole("ADMIN");
  const { month, employeeId } = parse(fd);
  if (!isValidMonth(month)) return { error: "Tháng không hợp lệ" };

  const result = await calculateMonth(month, employeeId);
  const who = employeeId ? (await prisma.employee.findUnique({ where: { id: employeeId }, select: { code: true } }))?.code ?? employeeId : "toàn công ty";
  await logAudit({
    actorId: admin.id,
    action: "payroll.calculate",
    targetType: "Payslip",
    summary: `Tính lương tháng ${month} (${who}): ${result.calculated} phiếu${result.missingSalary.length ? `, ${result.missingSalary.length} người chưa có mức lương` : ""}`,
  });
  refresh();
  const missing = result.missingSalary.length ? ` Chưa có mức lương: ${result.missingSalary.map((m) => m.code).join(", ")}.` : "";
  return { ok: true, message: `Đã tính ${result.calculated} phiếu.${missing}` };
}

/** "Gửi" / "Gửi lại": nhân sự thấy số liệu mới nhất sau khi gửi. Không truyền employeeId = gửi mọi phiếu chưa gửi / vừa tính lại. */
export async function sendPayroll(_prev: PayrollActionState, fd: FormData): Promise<PayrollActionState> {
  const admin = await requireRole("ADMIN");
  const { month, employeeId } = parse(fd);
  if (!isValidMonth(month)) return { error: "Tháng không hợp lệ" };

  const count = await sendPayslips(month, employeeId);
  if (count === 0) return { error: "Không có phiếu nào cần gửi (chưa tính, hoặc đã gửi và chưa tính lại)" };
  await logAudit({ actorId: admin.id, action: "payroll.send", targetType: "Payslip", summary: `Gửi ${count} phiếu lương tháng ${month}${employeeId ? " (1 người)" : ""}` });
  refresh();
  return { ok: true, message: `Đã gửi ${count} phiếu.` };
}
