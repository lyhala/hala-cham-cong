// Performance ↔ Google Sheet (spec §8, §9). Hàm thuần, không đụng DB/mạng để dễ kiểm tra.
//
// Leader chấm điểm (0–5) trên Google Sheet, Admin bấm "Sync ngay" để kéo vào hệ thống.
// File Sheet Performance RIÊNG (không dùng chung file với Bảng lương) để dễ tổng hợp. Mỗi tháng 1 tab "YYYY-MM": cột Mã NV, Nhân sự, Team, rồi mỗi tiêu chí 1 cột
// (tiêu đề cột = TÊN TIÊU CHÍ, nên tiêu chí đổi tên được ở Cấu hình thì tạo lại tab tháng mới).
//   Hệ số performance = Σ(điểm tiêu chí × trọng số %) ÷ 5

export const PERF_HEADER = { code: "Mã NV", name: "Nhân sự", team: "Team" } as const;

/** Tên tab của tháng — chính là "YYYY-MM" (file Performance riêng nên không cần tiền tố). */
export const perfTabName = (month: string) => month;

type Criterion = { id: string; name: string };

/** Dựng tab mẫu của 1 tháng: tiêu đề + mỗi nhân sự 1 dòng (đã sắp theo Mã NV), các ô điểm để trống cho Leader điền. */
export function buildPerfTemplate(criteria: { name: string }[], employees: { code: string; name: string; team: string | null }[]) {
  const header = [PERF_HEADER.code, PERF_HEADER.name, PERF_HEADER.team, ...criteria.map((c) => c.name)];
  return [header, ...employees.map((e) => [e.code, e.name, e.team ?? "", ...criteria.map(() => "")])] as string[][];
}

/** Ô điểm: số 0–5 (chấp nhận "4,5"); ô trống → null; ngoài khoảng / chữ → "invalid". */
export function parseScoreCell(v: unknown): number | null | "invalid" {
  if (v == null) return null;
  const s = typeof v === "number" ? String(v) : String(v).trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 5) return "invalid";
  return Math.round(n * 100) / 100;
}

export type ParsedPerf = {
  rows: { code: string; scores: Map<string, number | null> }[]; // criterionId → điểm (null = ô trống)
  missingCriteria: string[]; // Tiêu chí không có cột trong tab (điểm của tiêu chí này KHÔNG bị đổi)
  errors: string[];
};

/** Đọc tab điểm: nhận cột tiêu chí theo TÊN (không phân biệt hoa thường, không phụ thuộc thứ tự cột). */
export function parsePerfSheet(values: unknown[][], criteria: Criterion[]): ParsedPerf {
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const headerAt = values.findIndex((row) => row.some((c) => norm(c) === norm(PERF_HEADER.code)));
  if (headerAt < 0) return { rows: [], missingCriteria: [], errors: [`Không thấy cột "${PERF_HEADER.code}" trong tab — tab có đúng là tab tạo từ hệ thống không?`] };

  const header = values[headerAt];
  const codeCol = header.findIndex((c) => norm(c) === norm(PERF_HEADER.code));
  const columns = criteria.map((c) => ({ c, col: header.findIndex((h) => norm(h) === norm(c.name)) }));
  const found = columns.filter((x) => x.col >= 0);
  const missingCriteria = columns.filter((x) => x.col < 0).map((x) => x.c.name);
  if (found.length === 0) return { rows: [], missingCriteria, errors: ["Tab không có cột nào trùng tên tiêu chí. Tiêu chí có thể đã đổi tên sau khi tạo tab — hãy tạo tab tháng mới."] };

  const rows: ParsedPerf["rows"] = [];
  const errors: string[] = [];
  values.slice(headerAt + 1).forEach((line, i) => {
    const code = String(line[codeCol] ?? "").trim().toUpperCase();
    if (!code) return;
    const scores = new Map<string, number | null>();
    let bad = false;
    for (const { c, col } of found) {
      const parsed = parseScoreCell(line[col]);
      if (parsed === "invalid") {
        errors.push(`Dòng ${headerAt + i + 2} (${code}), cột "${c.name}": điểm phải là số từ 0 đến 5`);
        bad = true;
      } else scores.set(c.id, parsed);
    }
    if (!bad) rows.push({ code, scores });
  });
  return { rows, missingCriteria, errors };
}
