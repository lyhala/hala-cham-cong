import "server-only";

import { prisma } from "@/lib/db";
import { addTab, listTabs, readValues, replaceValues, SheetsError } from "@/lib/google-sheets";
import { columnLetter, spreadsheetIdFromUrl } from "@/lib/payroll-sheet";
import { buildPerfTemplate, parsePerfSheet, perfTabName } from "@/lib/performance-sheet";
import { getSetting } from "@/lib/settings-db";

/** File Sheet Performance cố định (cấu hình googleSheets.performanceSheetUrl). */
async function perfSpreadsheetId() {
  const { performanceSheetUrl } = await getSetting("googleSheets");
  if (!performanceSheetUrl) throw new SheetsError("Chưa nhập link file Google Sheet Performance (Cấu hình → Hệ thống).");
  const id = spreadsheetIdFromUrl(performanceSheetUrl);
  if (!id) throw new SheetsError("Link Google Sheet Performance không hợp lệ.");
  return id;
}

const orderedCriteria = () => prisma.performanceCriterion.findMany({ orderBy: [{ group: "asc" }, { sortOrder: "asc" }] });

/**
 * Tạo tab chấm điểm của tháng: tiêu đề = tên các tiêu chí hiện tại, mỗi nhân sự đang làm 1 dòng.
 * Tab đã có thì KHÔNG ghi đè (Leader có thể đã chấm) — chỉ báo là đã có.
 */
export async function createPerfTab(month: string) {
  const spreadsheetId = await perfSpreadsheetId();
  const tab = perfTabName(month);
  if ((await listTabs(spreadsheetId)).includes(tab)) return { created: false as const, tab };

  const [criteria, employees] = await Promise.all([
    orderedCriteria(),
    prisma.employee.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" }, select: { code: true, name: true, team: { select: { name: true } } } }),
  ]);
  await addTab(spreadsheetId, tab);
  const values = buildPerfTemplate(criteria, employees.map((e) => ({ code: e.code, name: e.name, team: e.team?.name ?? null })));
  await replaceValues(spreadsheetId, tab, `A1:${columnLetter(2 + criteria.length)}`, values);
  return { created: true as const, tab, employees: employees.length, criteria: criteria.length };
}

/**
 * Sync điểm từ tab "Performance YYYY-MM": ô có điểm → lưu; ô để trống → xóa điểm đã lưu (Sheet là nguồn đúng).
 * Tiêu chí không có cột trong tab thì giữ nguyên điểm cũ. Mã NV không có trong hệ thống được báo lại.
 */
export async function syncPerformanceFromSheet(month: string) {
  const spreadsheetId = await perfSpreadsheetId();
  const tab = perfTabName(month);
  if (!(await listTabs(spreadsheetId)).includes(tab)) throw new SheetsError(`Chưa có tab "${tab}" — hãy bấm "Tạo tab tháng" trước.`);

  const criteria = await orderedCriteria();
  const parsed = parsePerfSheet(await readValues(spreadsheetId, tab, `A1:${columnLetter(2 + criteria.length + 5)}`), criteria);
  if (parsed.rows.length === 0 && parsed.errors.length) throw new SheetsError(parsed.errors[0]);

  const employees = await prisma.employee.findMany({ where: { code: { in: parsed.rows.map((r) => r.code) } }, select: { id: true, code: true } });
  const idOf = new Map(employees.map((e) => [e.code, e.id]));
  const unknown = parsed.rows.filter((r) => !idOf.has(r.code)).map((r) => r.code);
  const syncedCriteria = criteria.filter((c) => parsed.rows[0]?.scores.has(c.id)).map((c) => c.id);

  const toSave: { employeeId: string; criterionId: string; month: string; score: number }[] = [];
  const cleared: { employeeId: string; criterionId: string }[] = [];
  for (const row of parsed.rows) {
    const employeeId = idOf.get(row.code);
    if (!employeeId) continue;
    for (const [criterionId, score] of row.scores) {
      if (score === null) cleared.push({ employeeId, criterionId });
      else toSave.push({ employeeId, criterionId, month, score });
    }
  }

  await prisma.$transaction([
    // Xóa điểm cũ của đúng các ô được sync (kể cả ô đã bị để trống) rồi ghi lại — 2 câu lệnh thay vì hàng trăm upsert
    prisma.performanceScore.deleteMany({ where: { month, criterionId: { in: syncedCriteria }, employeeId: { in: employees.map((e) => e.id) } } }),
    prisma.performanceScore.createMany({ data: toSave }),
  ]);
  return {
    employees: new Set(toSave.map((s) => s.employeeId)).size,
    saved: toSave.length,
    cleared: cleared.length,
    unknown,
    missingCriteria: parsed.missingCriteria,
    errors: parsed.errors,
  };
}
