// Bảng lương ↔ Google Sheet (spec §9, §14.1). Hàm thuần, không đụng DB/mạng để dễ kiểm tra.
//
// Tab "YYYY-MM" trong 1 file Sheet cố định. Hệ thống xuất số liệu lương; HR điền tay 3 cột
// BHXH (NLĐ trả), BHXH (công ty trả), Thuế rồi bấm "Sync Tổng chi phí" để hệ thống đọc ngược lại.
//   Tổng chi phí = Thực nhận + BHXH (NLĐ) + BHXH (công ty) + Thuế
// Các cột BHXH/Thuế/Tổng chi phí CHỈ ở Sheet và trang Admin — không bao giờ nằm trong phiếu lương gửi nhân sự.

export type HrFields = { bhxhEmployee: number | null; bhxhCompany: number | null; tax: number | null };

export type SheetPayslipRow = HrFields & {
  code: string;
  name: string;
  team: string | null;
  baseSalary: number;
  perfSalary: number;
  perfCoefficient: number;
  annualLeaveUsed: number;
  unpaidLeaveDays: number;
  actualWorkUnits: number;
  standardWorkDays: number;
  otHours: number;
  totalUnits: number;
  salaryByUnits: number;
  perfActual: number;
  mealAllowance: number;
  parkingAllowance: number;
  latePenalty: number;
  advanceDeduction: number;
  netPay: number;
};

export const HEADER = {
  code: "Mã NV",
  bhxhEmployee: "BHXH (NLĐ trả)",
  bhxhCompany: "BHXH (công ty trả)",
  tax: "Thuế",
  totalCost: "Tổng chi phí",
} as const;

// Cột số liệu hệ thống điền (theo thứ tự hiển thị, đúng §6.5)
const SYSTEM_COLUMNS: { header: string; value: (r: SheetPayslipRow) => string | number }[] = [
  { header: HEADER.code, value: (r) => r.code },
  { header: "Nhân sự", value: (r) => r.name },
  { header: "Team", value: (r) => r.team ?? "" },
  { header: "Lương base", value: (r) => r.baseSalary },
  { header: "Lương performance", value: (r) => r.perfSalary },
  { header: "Hệ số performance", value: (r) => r.perfCoefficient },
  { header: "Nghỉ phép", value: (r) => r.annualLeaveUsed },
  { header: "Nghỉ không lương", value: (r) => r.unpaidLeaveDays },
  { header: "Công thực", value: (r) => r.actualWorkUnits },
  { header: "Ngày công tháng", value: (r) => r.standardWorkDays },
  { header: "OT (giờ)", value: (r) => r.otHours },
  { header: "Tổng công", value: (r) => r.totalUnits },
  { header: "Lương theo tổng công", value: (r) => r.salaryByUnits },
  { header: "Performance thực", value: (r) => r.perfActual },
  { header: "Hỗ trợ cơm", value: (r) => r.mealAllowance },
  { header: "Tiền gửi xe", value: (r) => r.parkingAllowance },
  { header: "Phạt đi muộn", value: (r) => r.latePenalty },
  { header: "Tạm ứng lương", value: (r) => r.advanceDeduction },
  { header: "Thực nhận", value: (r) => r.netPay },
];
const NET_PAY_INDEX = SYSTEM_COLUMNS.length - 1;

/** 0 → "A", 25 → "Z", 26 → "AA" */
export function columnLetter(index: number) {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Cột cuối cùng của tab (để đọc/xóa/ghi đúng vùng). */
export const LAST_COLUMN = columnLetter(SYSTEM_COLUMNS.length + 3); // 3 cột HR + Tổng chi phí

/**
 * Tổng chi phí = Thực nhận + BHXH (NLĐ) + BHXH (công ty) + Thuế.
 * Cả 3 ô HR đều trống → chưa điền → null. Có ít nhất 1 ô điền thì ô trống tính là 0 (khớp công thức trên Sheet).
 */
export function calcTotalCost(netPay: number, hr: HrFields) {
  if (hr.bhxhEmployee == null && hr.bhxhCompany == null && hr.tax == null) return null;
  return netPay + (hr.bhxhEmployee ?? 0) + (hr.bhxhCompany ?? 0) + (hr.tax ?? 0);
}

/**
 * Dựng bảng giá trị để ghi vào tab. `existingHr`: 3 ô HR đang có trên Sheet (theo Mã NV) — ưu tiên giữ nguyên để
 * xuất lại không xóa mất số HR vừa gõ mà chưa sync; ô Sheet trống thì lấy số đã lưu trong hệ thống.
 */
export function buildSheetValues(rows: SheetPayslipRow[], existingHr: Map<string, HrFields> = new Map()) {
  const hrStart = SYSTEM_COLUMNS.length;
  const header = [...SYSTEM_COLUMNS.map((c) => c.header), HEADER.bhxhEmployee, HEADER.bhxhCompany, HEADER.tax, HEADER.totalCost];
  const body = rows.map((r, i) => {
    const onSheet = existingHr.get(r.code);
    const pick = (k: keyof HrFields) => onSheet?.[k] ?? r[k] ?? "";
    const line = i + 2; // dòng 1 là tiêu đề
    const net = columnLetter(NET_PAY_INDEX);
    const first = columnLetter(hrStart);
    const last = columnLetter(hrStart + 2);
    return [
      ...SYSTEM_COLUMNS.map((c) => c.value(r)),
      pick("bhxhEmployee"),
      pick("bhxhCompany"),
      pick("tax"),
      `=${net}${line}+SUM(${first}${line}:${last}${line})`, // ô trống tính là 0
    ];
  });
  return [header, ...body];
}

/** "1.250.000" / "1,250,000" / 1250000 → 1250000; ô trống → null; chữ khác/số âm → "invalid". */
export function parseMoneyCell(v: unknown): number | null | "invalid" {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v) : "invalid";
  const s = String(v).trim().replace(/\s|đ|₫|VNĐ|VND/gi, "");
  if (s === "") return null;
  if (!/^\d+([.,]\d{3})*$/.test(s) && !/^\d+$/.test(s)) return "invalid";
  return Number(s.replace(/[.,]/g, ""));
}

export type ParsedSheet = { rows: ({ code: string } & HrFields)[]; errors: string[] };

/** Đọc lại tab: tìm cột theo tên tiêu đề (không phụ thuộc thứ tự cột), lấy 3 ô HR của từng Mã NV. */
export function parseSheetValues(values: unknown[][]): ParsedSheet {
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const headerAt = values.findIndex((row) => row.some((c) => norm(c) === norm(HEADER.code)));
  if (headerAt < 0) return { rows: [], errors: [`Không thấy cột "${HEADER.code}" trong tab — tab có đúng là file xuất từ hệ thống không?`] };

  const header = values[headerAt];
  const col = (name: string) => header.findIndex((c) => norm(c) === norm(name));
  const idx = { code: col(HEADER.code), bhxhEmployee: col(HEADER.bhxhEmployee), bhxhCompany: col(HEADER.bhxhCompany), tax: col(HEADER.tax) };
  const missing = (["bhxhEmployee", "bhxhCompany", "tax"] as const).filter((k) => idx[k] < 0).map((k) => `"${HEADER[k]}"`);
  if (missing.length) return { rows: [], errors: [`Thiếu cột ${missing.join(", ")} trong tab`] };

  const rows: ParsedSheet["rows"] = [];
  const errors: string[] = [];
  values.slice(headerAt + 1).forEach((line, i) => {
    const code = String(line[idx.code] ?? "").trim().toUpperCase();
    if (!code) return;
    const sheetRow = headerAt + i + 2;
    const parsed = {
      bhxhEmployee: parseMoneyCell(line[idx.bhxhEmployee]),
      bhxhCompany: parseMoneyCell(line[idx.bhxhCompany]),
      tax: parseMoneyCell(line[idx.tax]),
    };
    const bad = (Object.keys(parsed) as (keyof HrFields)[]).filter((k) => parsed[k] === "invalid");
    if (bad.length) {
      errors.push(`Dòng ${sheetRow} (${code}): giá trị không hợp lệ ở ${bad.map((k) => `"${HEADER[k]}"`).join(", ")} — chỉ nhập số không âm`);
      return;
    }
    rows.push({ code, ...(parsed as HrFields) });
  });
  return { rows, errors };
}

/** Lấy ID file từ link Google Sheet: https://docs.google.com/spreadsheets/d/<ID>/edit... */
export function spreadsheetIdFromUrl(url: string) {
  return url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}
