// Định dạng hiển thị / đọc dữ liệu nhập từ form.

/** 13000000 → "13.000.000" */
export function fmtMoney(n: number | null | undefined) {
  return n == null ? "—" : n.toLocaleString("vi-VN");
}

/** "13.000.000" / "13,000,000" / "13000000" → 13000000. Không hợp lệ → null */
export function parseMoney(input: FormDataEntryValue | null): number | null {
  const digits = String(input ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n <= 2_000_000_000 ? n : null;
}

/** Cột @db.Date → "YYYY-MM-DD" cho <input type="date"> */
export function toDateInput(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : "";
}

/** "YYYY-MM-DD" → Date 00:00 UTC để lưu vào cột @db.Date. Rỗng / sai → null */
export function fromDateInput(input: FormDataEntryValue | null): Date | null {
  const s = String(input ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Cột @db.Date → "24/09/2026" */
export function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.toISOString().slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

/** Chữ cái đầu của tên (tên gọi, VD "Ninh Thành Vinh" → "V") */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.at(-1)?.[0] ?? "?").toUpperCase();
}
