"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/session";
import { isValidMonth } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { SheetsError } from "@/lib/google-sheets";
import { calculateMonth, sendPayslips } from "@/lib/payroll-db";
import { exportPayrollToSheet, syncPayrollFromSheet } from "@/lib/payroll-sheet-db";
import { spreadsheetIdFromUrl } from "@/lib/payroll-sheet";
import { retentionCutoffs } from "@/lib/retention";
import { getSetting } from "@/lib/settings-db";

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

  // Chấm công và đơn từ chỉ giữ vài tháng (§17) — tháng cũ hơn không còn dữ liệu nguồn, tính lại sẽ ra kết quả sai
  const cut = retentionCutoffs(await getSetting("retention"));
  const oldest = cut.attendanceMonth > cut.requestMonth ? cut.attendanceMonth : cut.requestMonth;
  if (month < oldest) return { error: `Dữ liệu chấm công / đơn từ tháng ${month} đã bị xóa theo chính sách lưu trữ nên không tính lại được (chỉ tính lại từ tháng ${oldest}). Phiếu đã tính được giữ nguyên.` };

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

/** Chạy 1 thao tác với Google Sheet; lỗi Google (chưa chia sẻ file, sai link...) trả về thông báo tiếng Việt thay vì làm sập trang. */
async function withSheets(run: () => Promise<PayrollActionState>): Promise<PayrollActionState> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof SheetsError) return { error: e.message };
    console.error(e);
    return { error: "Có lỗi khi làm việc với Google Sheet, vui lòng thử lại." };
  }
}

/** "Xuất ra Sheet": ghi bảng lương tháng vào tab "YYYY-MM" của file Sheet cố định. */
export async function exportPayrollSheet(_prev: PayrollActionState, fd: FormData): Promise<PayrollActionState> {
  const admin = await requireRole("ADMIN");
  const { month } = parse(fd);
  if (!isValidMonth(month)) return { error: "Tháng không hợp lệ" };
  return withSheets(async () => {
    const r = await exportPayrollToSheet(month);
    await logAudit({ actorId: admin.id, action: "payroll.export_sheet", targetType: "Payslip", summary: `Xuất bảng lương tháng ${month} ra Google Sheet (${r.rows} dòng)` });
    return { ok: true, message: `Đã xuất ${r.rows} dòng ra tab ${month}${r.createdTab ? " (tab mới)" : " (cập nhật tab có sẵn, giữ nguyên số HR đã gõ)"}. HR điền BHXH và Thuế rồi bấm "Sync Tổng chi phí".` };
  });
}

/** "Sync Tổng chi phí": đọc BHXH (NLĐ), BHXH (công ty), Thuế HR đã điền → tính Tổng chi phí. */
export async function syncPayrollSheet(_prev: PayrollActionState, fd: FormData): Promise<PayrollActionState> {
  const admin = await requireRole("ADMIN");
  const { month } = parse(fd);
  if (!isValidMonth(month)) return { error: "Tháng không hợp lệ" };
  return withSheets(async () => {
    const r = await syncPayrollFromSheet(month);
    await logAudit({ actorId: admin.id, action: "payroll.sync_sheet", targetType: "Payslip", summary: `Sync BHXH/Thuế tháng ${month} từ Google Sheet: cập nhật ${r.updated} phiếu` });
    refresh();
    const notes = [
      r.missing.length ? `${r.missing.length} người chưa có trên Sheet (${r.missing.slice(0, 5).join(", ")}${r.missing.length > 5 ? "…" : ""}) — hãy "Xuất ra Sheet" lại` : "",
      r.notFound.length ? `Mã NV không có phiếu tháng này: ${r.notFound.join(", ")}` : "",
      ...r.errors,
    ].filter(Boolean);
    return { ok: true, message: `Đã cập nhật ${r.updated} phiếu.${notes.length ? ` Lưu ý: ${notes.join(" • ")}` : ""}` };
  });
}

/** Lưu link file Google Sheet Bảng lương cố định (mỗi tháng chỉ thêm tab mới vào file này). */
export async function savePayrollSheetUrl(_prev: PayrollActionState, fd: FormData): Promise<PayrollActionState> {
  const admin = await requireRole("ADMIN");
  const url = String(fd.get("url") ?? "").trim();
  if (!spreadsheetIdFromUrl(url)) return { error: "Link không hợp lệ — dán link file Google Sheet (docs.google.com/spreadsheets/d/...)" };

  const current = await getSetting("googleSheets");
  const newId = spreadsheetIdFromUrl(url);
  for (const [flow, other] of Object.entries(current)) {
    if (flow !== "payrollSheetUrl" && other && spreadsheetIdFromUrl(other) === newId) return { error: "File này đang được dùng cho luồng khác — mỗi luồng cần 1 file Google Sheet riêng." };
  }
  await prisma.setting.upsert({
    where: { key: "googleSheets" },
    create: { key: "googleSheets", value: { ...current, payrollSheetUrl: url }, updatedById: admin.id },
    update: { value: { ...current, payrollSheetUrl: url }, updatedById: admin.id },
  });
  await logAudit({ actorId: admin.id, action: "config.update", targetType: "Setting", targetId: "googleSheets", summary: "Đặt link file Google Sheet Bảng lương" });
  refresh();
  return { ok: true, message: "Đã lưu link file Sheet." };
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
