// Kiểm tra dữ liệu nhập ở màn Cấu hình trước khi lưu vào bảng Setting. Hàm thuần, không đụng DB để dễ kiểm tra.
// Mỗi hàm nhận "form" (FormData hoặc giả lập trong test) và trả { value } nếu hợp lệ, hoặc { error } bằng tiếng Việt.

import type { RequestType } from "@/generated/prisma/enums";
import { parseMoney } from "@/lib/format";
import { spreadsheetIdFromUrl } from "@/lib/payroll-sheet";
import type { DayHours, SETTING_DEFAULTS } from "@/lib/settings";

export type Form = { get(name: string): unknown; getAll(name: string): unknown[] };
export type Parsed<T> = { value: T; error?: undefined } | { error: string; value?: undefined };

const fail = (error: string): { error: string } => ({ error });
const str = (f: Form, k: string) => String(f.get(k) ?? "").trim();
const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const num = (f: Form, k: string) => {
  const s = str(f, k).replace(",", ".");
  return s === "" || !Number.isFinite(Number(s)) ? null : Number(s);
};
const int = (f: Form, k: string, min: number, max: number) => {
  const n = num(f, k);
  return n !== null && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

type Defaults = typeof SETTING_DEFAULTS;

const WEEKDAY_LABEL = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
export { WEEKDAY_LABEL };

/**
 * Giờ làm việc: giờ MẶC ĐỊNH (4 mốc, dùng cho ngày thường) + từng thứ trong tuần có làm việc, mỗi thứ có thể có giờ riêng
 * (VD thứ 7 chỉ làm sáng). Mỗi buổi nhập đủ giờ vào / giờ ra, hoặc để trống cả hai = không làm buổi đó. Ô "số công" để trống
 * = tự tính theo tỷ lệ giờ. Thứ nào giống hệt giờ mặc định thì không lưu giờ riêng. Giờ công chuẩn/ngày tự suy ra từ đây.
 */
export function parseWorkSchedule(f: Form): Parsed<Defaults["workSchedule"]> {
  const t = { morningStart: str(f, "morningStart"), morningEnd: str(f, "morningEnd"), afternoonStart: str(f, "afternoonStart"), afternoonEnd: str(f, "afternoonEnd") };
  if (!Object.values(t).every(isTime)) return fail("Vui lòng nhập đủ 4 mốc giờ mặc định (dạng HH:mm)");
  if (!(t.morningStart < t.morningEnd && t.morningEnd < t.afternoonStart && t.afternoonStart < t.afternoonEnd)) {
    return fail("Các mốc giờ mặc định phải tăng dần: vào ca sáng < hết ca sáng < vào ca chiều < hết ca chiều");
  }

  const workWeekdays: number[] = [];
  const daySchedules: Record<string, DayHours> = {};
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    if (str(f, `work_${d}`) !== "on") continue;
    workWeekdays.push(d);
    const label = WEEKDAY_LABEL[d];

    const unitRaw = str(f, `unit_${d}`).replace(",", ".");
    const unit = unitRaw === "" ? null : Number(unitRaw);
    if (unit !== null && !(Number.isFinite(unit) && unit > 0 && unit <= 1)) return fail(`${label}: số công của ngày phải lớn hơn 0 và tối đa 1`);

    const times = [str(f, `ms_${d}`), str(f, `me_${d}`), str(f, `as_${d}`), str(f, `ae_${d}`)];
    // Bỏ trống hết giờ = dùng giờ mặc định
    let [ms, me, as, ae] = times.every((v) => v === "") ? [t.morningStart, t.morningEnd, t.afternoonStart, t.afternoonEnd] : times;

    const filled = (a: string, b: string) => [a, b].filter(Boolean).length;
    if (filled(ms, me) === 1) return fail(`${label}: buổi sáng phải nhập đủ giờ vào và giờ ra (hoặc đặt giờ vào = giờ ra, VD 12:00 – 12:00, nếu không làm buổi sáng)`);
    if (filled(as, ae) === 1) return fail(`${label}: buổi chiều phải nhập đủ giờ vào và giờ ra (hoặc đặt giờ vào = giờ ra, VD 12:00 – 12:00, nếu không làm buổi chiều)`);
    if (![ms, me, as, ae].filter(Boolean).every(isTime)) return fail(`${label}: giờ phải có dạng HH:mm`);
    // Giờ vào = giờ ra (VD 12:00 – 12:00) hoặc để trống cả hai nghĩa là KHÔNG làm buổi đó
    if (ms === me) [ms, me] = ["", ""];
    if (as === ae) [as, ae] = ["", ""];
    if (!ms && !as) return fail(`${label}: cần ít nhất 1 buổi làm việc`);
    if (ms && me <= ms) return fail(`${label}: giờ ra buổi sáng phải sau giờ vào`);
    if (as && ae <= as) return fail(`${label}: giờ ra buổi chiều phải sau giờ vào`);
    if (ms && as && as <= me) return fail(`${label}: buổi chiều phải bắt đầu sau khi hết buổi sáng`);

    const sameAsDefault = ms === t.morningStart && me === t.morningEnd && as === t.afternoonStart && ae === t.afternoonEnd && unit === null;
    if (!sameAsDefault) daySchedules[String(d)] = { morningStart: ms || null, morningEnd: me || null, afternoonStart: as || null, afternoonEnd: ae || null, unit };
  }
  if (workWeekdays.length === 0) return fail("Chọn ít nhất 1 ngày làm việc trong tuần");
  return { value: { ...t, workWeekdays: workWeekdays.sort((a, b) => a - b), daySchedules } };
}
const MAX_TIERS = 8;

/** Bảng phạt đi muộn lũy tiến: các khung (từ – đến, đ/phút), mốc đến sau giờ này thì trừ ½ công, số lần miễn phạt/tháng. */
export function parseLatePenalty(f: Form, morningStart: string): Parsed<Defaults["latePenalty"]> {
  const tiers: Defaults["latePenalty"]["tiers"] = [];
  for (let i = 0; i < MAX_TIERS; i++) {
    const from = str(f, `tierFrom${i}`);
    const to = str(f, `tierTo${i}`);
    const rateRaw = str(f, `tierRate${i}`);
    if (!from && !to && !rateRaw) continue; // dòng trống bỏ qua
    if (!isTime(from) || !isTime(to)) return fail(`Khung phạt dòng ${i + 1}: nhập giờ dạng HH:mm`);
    const perMinute = parseMoney(rateRaw);
    if (perMinute === null) return fail(`Khung phạt dòng ${i + 1}: nhập mức phạt đ/phút`);
    if (from > to) return fail(`Khung phạt dòng ${i + 1}: giờ bắt đầu phải trước giờ kết thúc`);
    tiers.push({ from, to, perMinute });
  }
  tiers.sort((a, b) => a.from.localeCompare(b.from));
  for (let i = 0; i < tiers.length; i++) {
    if (tiers[i].from <= morningStart) return fail(`Khung phạt phải bắt đầu sau giờ vào ca (${morningStart})`);
    if (i > 0 && tiers[i].from <= tiers[i - 1].to) return fail("Các khung phạt không được chồng lên nhau");
  }
  const halfDayAfter = str(f, "halfDayAfter");
  if (!isTime(halfDayAfter)) return fail("Nhập mốc giờ trừ ½ công (dạng HH:mm)");
  if (halfDayAfter <= morningStart) return fail("Mốc trừ ½ công phải sau giờ vào ca");
  if (tiers.length && tiers[tiers.length - 1].to > halfDayAfter) return fail("Khung phạt cuối phải kết thúc không muộn hơn mốc trừ ½ công");
  const freeExemptionsPerMonth = int(f, "freeExemptionsPerMonth", 0, 31);
  if (freeExemptionsPerMonth === null) return fail("Số lần miễn phạt mỗi tháng phải là số nguyên từ 0 đến 31");
  return { value: { tiers, halfDayAfter, freeExemptionsPerMonth } };
}

/** Tham số lương: hỗ trợ cơm, tiền gửi xe, hệ số OT. */
export function parseSalaryParams(f: Form): Parsed<Defaults["salaryParams"]> {
  const meal = parseMoney(f.get("mealAllowancePerMonth") as string);
  const parking = parseMoney(f.get("parkingPerDay") as string);
  if (meal === null || parking === null) return fail("Nhập số tiền hỗ trợ cơm và tiền gửi xe");
  const otCoefficients = { weekday: num(f, "otWeekday"), weekend: num(f, "otWeekend"), holiday: num(f, "otHoliday") };
  const bad = Object.values(otCoefficients).some((v) => v === null || v <= 0 || v > 10);
  if (bad) return fail("Hệ số OT phải là số lớn hơn 0 (tối đa 10)");
  return { value: { mealAllowancePerMonth: meal, parkingPerDay: parking, otCoefficients: otCoefficients as { weekday: number; weekend: number; holiday: number } } };
}

/** Phép năm: số ngày phép được cộng mỗi tháng (nhân sự chính thức) và số tháng thử việc mặc định. */
export function parseLeavePolicy(f: Form): Parsed<Defaults["leavePolicy"]> {
  const daysPerMonth = num(f, "daysPerMonth");
  const probationMonths = int(f, "probationMonths", 0, 12);
  if (daysPerMonth === null || daysPerMonth < 0 || daysPerMonth > 5) return fail("Số ngày phép mỗi tháng phải từ 0 đến 5");
  if (probationMonths === null) return fail("Số tháng thử việc phải là số nguyên từ 0 đến 12");
  return { value: { daysPerMonth, probationMonths } };
}

export const REQUEST_TYPES: RequestType[] = ["OT", "LATE", "EARLY_LEAVE", "LEAVE", "WFH", "SALARY_ADVANCE"];

/** Duyệt 1 cấp (Leader HOẶC Admin) hay 2 cấp (Leader rồi Admin) cho từng loại đơn. */
export function parseApprovalLevels(f: Form): Parsed<Defaults["approvalLevels"]> {
  const out = {} as Record<RequestType, 1 | 2>;
  for (const t of REQUEST_TYPES) {
    const v = str(f, `level_${t}`);
    if (v !== "1" && v !== "2") return fail("Chọn cách duyệt cho mọi loại đơn");
    out[t] = v === "2" ? 2 : 1;
  }
  return { value: out };
}

/** Bật/tắt quyền và nút chức năng theo role (checkbox: có tick = bật). */
export function parseRolePermissions(f: Form): Parsed<Defaults["rolePermissions"]> {
  const on = (k: string) => str(f, k) === "on";
  return {
    value: {
      leader: { approve: on("leader_approve") },
      employee: { wfh: on("employee_wfh"), advance: on("employee_advance") },
    },
  };
}

export const PAYSLIP_LINE_LABEL: Record<keyof Defaults["payslipVisibleLines"], string> = {
  baseSalary: "Lương base",
  perfSalary: "Lương performance",
  perfCoefficient: "Hệ số performance",
  workUnits: "Công thực",
  ot: "OT",
  mealAllowance: "Hỗ trợ cơm",
  parkingAllowance: "Tiền gửi xe",
  latePenalty: "Phạt đi muộn",
  advanceDeduction: "Tạm ứng lương",
  leavePayout: "Quy đổi phép tồn",
  annualLeave: "Nghỉ phép (số ngày)",
  unpaidLeave: "Nghỉ không lương (số ngày)",
};

/** Dòng nào hiện trên phiếu lương nhân sự thấy (Thực nhận luôn hiện). BHXH/Thuế/Tổng chi phí không bao giờ hiện. */
export function parsePayslipLines(f: Form): Parsed<Defaults["payslipVisibleLines"]> {
  const out = {} as Defaults["payslipVisibleLines"];
  for (const k of Object.keys(PAYSLIP_LINE_LABEL) as (keyof Defaults["payslipVisibleLines"])[]) out[k] = str(f, `line_${k}`) === "on";
  return { value: out };
}

export const RETENTION_LABEL: Record<keyof Defaults["retention"], string> = {
  payslipMonths: "Phiếu lương",
  attendanceMonths: "Chấm công (log Hanet + bảng công ngày)",
  allocationMonths: "Hệ số phân bổ dự án (chỉ xóa trong database, không xóa Sheet)",
  requestMonths: "Đơn từ",
  reportMonths: "Xem lại báo cáo chi phí (tối đa)",
};

/** Lưu trữ dữ liệu: số tháng giữ lại. */
export function parseRetention(f: Form): Parsed<Defaults["retention"]> {
  const out = {} as Defaults["retention"];
  for (const k of Object.keys(RETENTION_LABEL) as (keyof Defaults["retention"])[]) {
    const v = int(f, k, 1, 120);
    if (v === null) return fail(`${RETENTION_LABEL[k]}: nhập số tháng từ 1 đến 120`);
    out[k] = v;
  }
  return { value: out };
}

export const SHEET_LABEL: Record<keyof Defaults["googleSheets"], string> = {
  employeesSheetUrl: "Nhân sự",
  performanceSheetUrl: "Performance",
  payrollSheetUrl: "Bảng lương",
  allocationSheetUrl: "Hệ số phân bổ dự án",
  projectCostSheetUrl: "Chi phí dự án",
  teamCostSheetUrl: "Chi phí theo Team sản xuất",
};

/**
 * Link file Google Sheet cố định của từng luồng đồng bộ (để trống = chưa dùng).
 * Mỗi luồng dùng 1 file RIÊNG (VD Performance không dùng chung file với Bảng lương) để dễ tổng hợp — trùng file thì báo lỗi.
 */
export function parseSheetLinks(f: Form): Parsed<Defaults["googleSheets"]> {
  const out = {} as Defaults["googleSheets"];
  for (const k of Object.keys(SHEET_LABEL) as (keyof Defaults["googleSheets"])[]) {
    const v = str(f, k);
    if (v && !spreadsheetIdFromUrl(v)) return fail(`Link "${SHEET_LABEL[k]}" không hợp lệ — dán link file Google Sheet (docs.google.com/spreadsheets/d/...)`);
    out[k] = v || null;
  }
  const seen = new Map<string, keyof Defaults["googleSheets"]>();
  for (const k of Object.keys(SHEET_LABEL) as (keyof Defaults["googleSheets"])[]) {
    const id = out[k] ? spreadsheetIdFromUrl(out[k]!) : null;
    if (!id) continue;
    const other = seen.get(id);
    if (other) return fail(`"${SHEET_LABEL[other]}" và "${SHEET_LABEL[k]}" đang dùng cùng 1 file Google Sheet — mỗi luồng cần 1 file riêng`);
    seen.set(id, k);
  }
  return { value: out };
}

export type CriterionRow = { id: string | null; group: "BASE" | "OUT"; name: string; weight: number; remove: boolean };
const MAX_CRITERIA = 20;

/**
 * Tiêu chí Performance: sửa tên / trọng số / nhóm, thêm dòng mới (id trống), xóa dòng (tick "Xóa").
 * Tổng trọng số các tiêu chí còn lại phải đúng 100%. Tên không được trùng (vì cột trên Google Sheet nhận diện theo tên).
 */
export function parseCriteria(f: Form): Parsed<CriterionRow[]> {
  const rows: CriterionRow[] = [];
  for (let i = 0; i < MAX_CRITERIA; i++) {
    const id = str(f, `id${i}`) || null;
    const name = str(f, `name${i}`);
    const weightRaw = str(f, `weight${i}`);
    const remove = str(f, `remove${i}`) === "on";
    if (!id && !name && !weightRaw) continue; // dòng mới bỏ trống
    if (id && remove) {
      rows.push({ id, group: str(f, `group${i}`) === "OUT" ? "OUT" : "BASE", name, weight: 0, remove: true });
      continue;
    }
    if (!name) return fail(`Tiêu chí dòng ${i + 1}: nhập tên tiêu chí`);
    const weight = int(f, `weight${i}`, 0, 100);
    if (weight === null) return fail(`Tiêu chí "${name}": trọng số phải là số nguyên từ 0 đến 100`);
    rows.push({ id, group: str(f, `group${i}`) === "OUT" ? "OUT" : "BASE", name, weight, remove: false });
  }
  const kept = rows.filter((r) => !r.remove);
  if (kept.length === 0) return fail("Cần ít nhất 1 tiêu chí");
  const names = kept.map((r) => r.name.toLowerCase());
  if (new Set(names).size !== names.length) return fail("Tên tiêu chí không được trùng nhau");
  const total = kept.reduce((s, r) => s + r.weight, 0);
  if (total !== 100) return fail(`Tổng trọng số hiện là ${total}% — phải đúng 100%`);
  return { value: rows };
}
