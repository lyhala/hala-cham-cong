import "server-only";

import { prisma } from "@/lib/db";
import { addTab, listTabs, readValues, replaceValues, SheetsError } from "@/lib/google-sheets";
import { buildSheetValues, calcTotalCost, LAST_COLUMN, parseSheetValues, spreadsheetIdFromUrl, type HrFields, type SheetPayslipRow } from "@/lib/payroll-sheet";
import { getSetting } from "@/lib/settings-db";

const ALL_CELLS = `A1:${LAST_COLUMN}`;

/** File Sheet Bảng lương cố định (cấu hình googleSheets.payrollSheetUrl). */
async function payrollSpreadsheetId() {
  const { payrollSheetUrl } = await getSetting("googleSheets");
  if (!payrollSheetUrl) throw new SheetsError("Chưa nhập link file Google Sheet Bảng lương.");
  const id = spreadsheetIdFromUrl(payrollSheetUrl);
  if (!id) throw new SheetsError("Link Google Sheet Bảng lương không hợp lệ.");
  return id;
}

/**
 * Xuất bảng lương của 1 tháng ra tab "YYYY-MM" của file Sheet cố định (tab chưa có thì thêm).
 * Xuất lại nhiều lần được: số liệu hệ thống được cập nhật, còn 3 ô HR đã gõ trên Sheet (chưa sync) được giữ nguyên.
 */
export async function exportPayrollToSheet(month: string) {
  const spreadsheetId = await payrollSpreadsheetId();
  const payslips = await prisma.payslip.findMany({
    where: { month },
    include: { employee: { select: { code: true, name: true, team: { select: { name: true } } } } },
    orderBy: { employee: { code: "asc" } },
  });
  if (payslips.length === 0) throw new SheetsError(`Chưa có phiếu lương tháng ${month} — hãy bấm "Tính lương" trước.`);

  const exists = (await listTabs(spreadsheetId)).includes(month);
  const existingHr = new Map<string, HrFields>();
  if (exists) {
    for (const r of parseSheetValues(await readValues(spreadsheetId, month, ALL_CELLS)).rows) {
      if (r.bhxhEmployee != null || r.bhxhCompany != null || r.tax != null) existingHr.set(r.code, r);
    }
  } else {
    await addTab(spreadsheetId, month);
  }

  const rows: SheetPayslipRow[] = payslips.map((p) => ({ ...p, code: p.employee.code, name: p.employee.name, team: p.employee.team?.name ?? null }));
  await replaceValues(spreadsheetId, month, ALL_CELLS, buildSheetValues(rows, existingHr));
  return { rows: rows.length, createdTab: !exists };
}

/**
 * Đọc lại tab "YYYY-MM": lấy BHXH (NLĐ), BHXH (công ty), Thuế HR đã điền, tính Tổng chi phí rồi lưu vào phiếu lương.
 * Chỉ ghi vào bảng nội bộ; phiếu lương gửi cho nhân sự (publishedData) không chứa các số này.
 */
export async function syncPayrollFromSheet(month: string) {
  const spreadsheetId = await payrollSpreadsheetId();
  if (!(await listTabs(spreadsheetId)).includes(month)) throw new SheetsError(`Chưa có tab "${month}" trong file Sheet — hãy bấm "Xuất ra Sheet" trước.`);

  const parsed = parseSheetValues(await readValues(spreadsheetId, month, ALL_CELLS));
  if (parsed.rows.length === 0 && parsed.errors.length) throw new SheetsError(parsed.errors[0]);

  const payslips = await prisma.payslip.findMany({ where: { month }, include: { employee: { select: { code: true } } } });
  const byCode = new Map(payslips.map((p) => [p.employee.code, p]));

  let updated = 0;
  const notFound: string[] = [];
  for (const r of parsed.rows) {
    const p = byCode.get(r.code);
    if (!p) {
      notFound.push(r.code);
      continue;
    }
    await prisma.payslip.update({
      where: { id: p.id },
      data: { bhxhEmployee: r.bhxhEmployee, bhxhCompany: r.bhxhCompany, tax: r.tax, totalCost: calcTotalCost(p.netPay, r) },
    });
    updated++;
  }
  const missing = payslips.filter((p) => !parsed.rows.some((r) => r.code === p.employee.code)).map((p) => p.employee.code);
  return { updated, notFound, missing, errors: parsed.errors };
}
