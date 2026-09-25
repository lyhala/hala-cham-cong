"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/session";
import { recalcMonth } from "@/lib/attendance";
import {
  parseApprovalLevels, parseCriteria, parseLatePenalty, parseLeavePolicy, parsePayslipLines, parseRetention,
  parseRolePermissions, parseSalaryParams, parseSheetLinks, parseWorkSchedule, type Parsed,
} from "@/lib/config-validate";
import { isValidMonth } from "@/lib/dates";
import { daysInRange } from "@/lib/requests";
import { CALENDAR_KINDS, clearCalendarRange, MAX_RANGE_DAYS, setCalendarRange, type CalendarKind } from "@/lib/calendar-db";
import { prisma } from "@/lib/db";
import { SheetsError } from "@/lib/google-sheets";
import { applyCriteria } from "@/lib/criteria-db";
import { createPerfTab, syncPerformanceFromSheet } from "@/lib/performance-sheet-db";
import { getSetting } from "@/lib/settings-db";
import type { SettingKey } from "@/lib/settings";

// Server action là API công khai: mọi hàm đều requireRole("ADMIN") trước tiên. Mỗi lần lưu ghi nhật ký (config.update).

export type ConfigState = { ok?: boolean; error?: string; message?: string } | undefined;

function refresh() {
  revalidatePath("/admin/config");
  revalidatePath("/", "layout");
}

/** Lưu 1 nhóm cấu hình đã kiểm tra hợp lệ vào bảng Setting + ghi nhật ký. */
async function persist<K extends SettingKey>(key: K, parsed: Parsed<unknown>, summary: string, extra = ""): Promise<ConfigState> {
  const admin = await requireRole("ADMIN");
  if (parsed.error !== undefined) return { error: parsed.error };
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: parsed.value as Prisma.InputJsonValue, updatedById: admin.id },
    update: { value: parsed.value as Prisma.InputJsonValue, updatedById: admin.id },
  });
  await logAudit({ actorId: admin.id, action: "config.update", targetType: "Setting", targetId: key, summary });
  refresh();
  return { ok: true, message: `Đã lưu.${extra ? ` ${extra}` : ""}` };
}

const ADMIN_ONLY = async () => requireRole("ADMIN");

export async function saveWorkSchedule(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  await ADMIN_ONLY();
  return persist("workSchedule", parseWorkSchedule(fd), "Đổi giờ làm việc", "Áp dụng cho các ngày tính công từ giờ trở đi. Muốn áp dụng cho tháng đã có công, bấm “Tính lại công tháng”.");
}

export async function saveLatePenalty(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  await ADMIN_ONLY();
  const { morningStart } = await getSetting("workSchedule");
  return persist("latePenalty", parseLatePenalty(fd, morningStart), "Đổi bảng phạt đi muộn", "Muốn áp dụng cho tháng đã có công, bấm “Tính lại công tháng”.");
}

export async function saveSalaryParams(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  await ADMIN_ONLY();
  return persist("salaryParams", parseSalaryParams(fd), "Đổi tham số lương", "Bấm “Tính lại” ở Bảng lương để áp dụng cho tháng đã tính.");
}

export async function saveLeavePolicy(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  await ADMIN_ONLY();
  return persist("leavePolicy", parseLeavePolicy(fd), "Đổi chính sách phép năm");
}

export async function saveApprovalLevels(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  await ADMIN_ONLY();
  return persist("approvalLevels", parseApprovalLevels(fd), "Đổi cách duyệt đơn (1/2 cấp) theo loại đơn", "Chỉ áp dụng cho lần duyệt sau; đơn đang chờ vẫn duyệt theo cách mới.");
}

export async function saveRolePermissions(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  await ADMIN_ONLY();
  return persist("rolePermissions", parseRolePermissions(fd), "Đổi quyền / nút chức năng theo role");
}

export async function savePayslipLines(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  await ADMIN_ONLY();
  return persist("payslipVisibleLines", parsePayslipLines(fd), "Đổi các dòng hiện trên phiếu lương nhân sự", "Áp dụng ngay cho cả các phiếu đã gửi.");
}

export async function saveRetention(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  await ADMIN_ONLY();
  return persist("retention", parseRetention(fd), "Đổi thời gian lưu trữ dữ liệu", "Job xóa dữ liệu quá hạn chạy hằng ngày sẽ dùng số tháng mới.");
}

export async function saveSheetLinks(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  await ADMIN_ONLY();
  const parsed = parseSheetLinks(fd);
  if (parsed.error !== undefined) return { error: parsed.error };
  // Giữ nguyên các khóa khác của nhóm (nếu sau này có thêm) và chỉ đổi các link
  const current = await getSetting("googleSheets");
  return persist("googleSheets", { value: { ...current, ...parsed.value } }, "Đổi link các file Google Sheet đồng bộ");
}

// ───────────────────────── Lịch làm việc: ngày ngoại lệ ─────────────────────────


const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());

/**
 * Thêm / sửa ngày ngoại lệ so với lịch T2–T6: nghỉ lễ, nghỉ bù, đi làm bù (VD thứ 7). Chọn được CẢ MỘT DẢI NGÀY
 * (kỳ nghỉ lễ thường kéo dài vài ngày đến cả tuần) — "Đến ngày" để trống = chỉ 1 ngày. Công của các tháng bị ảnh hưởng tự tính lại.
 */
export async function addCalendarDay(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  const admin = await ADMIN_ONLY();
  const from = String(fd.get("dateFrom") ?? "");
  const to = String(fd.get("dateTo") ?? "").trim() || from;
  const kind = String(fd.get("kind") ?? "") as CalendarKind;
  const note = String(fd.get("note") ?? "").trim().slice(0, 100) || null;
  if (!isDay(from)) return { error: "Vui lòng chọn ngày (hoặc ngày bắt đầu của dải ngày)" };
  if (!isDay(to)) return { error: "Ngày kết thúc không hợp lệ" };
  if (to < from) return { error: "Ngày kết thúc phải từ ngày bắt đầu trở đi" };
  if (!(kind in CALENDAR_KINDS)) return { error: "Vui lòng chọn loại ngày" };
  const count = daysInRange(from, to).length;
  if (count > MAX_RANGE_DAYS) return { error: `Dải ngày quá dài (tối đa ${MAX_RANGE_DAYS} ngày một lần)` };

  const { recalculated } = await setCalendarRange(from, to, kind, note);
  const days = { length: count };
  const label = kind === "WORK" ? "ngày làm việc (đi làm bù)" : kind === "HOLIDAY" ? "ngày nghỉ lễ" : "ngày nghỉ";
  await logAudit({
    actorId: admin.id,
    action: "config.update",
    targetType: "WorkCalendarDay",
    targetId: from,
    summary: `Đặt ${days.length === 1 ? `ngày ${from}` : `${days.length} ngày ${from} → ${to}`} là ${label}${note ? ` (${note})` : ""}`,
  });
  refresh();
  revalidatePath("/admin/attendance");
  return { ok: true, message: `Đã lưu ${days.length === 1 ? "1 ngày" : `${days.length} ngày (${from} → ${to})`}. Đã tính lại ${recalculated} dòng công.` };
}

/** Bỏ ngày ngoại lệ (1 ngày hoặc cả dải ngày) về lịch T2–T6 mặc định. */
export async function removeCalendarDay(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  const admin = await ADMIN_ONLY();
  const from = String(fd.get("dateFrom") ?? "");
  const to = String(fd.get("dateTo") ?? "").trim() || from;
  if (!isDay(from) || !isDay(to) || to < from) return { error: "Ngày không hợp lệ" };
  const { removed, recalculated } = await clearCalendarRange(from, to);
  await logAudit({ actorId: admin.id, action: "config.update", targetType: "WorkCalendarDay", targetId: from, summary: `Bỏ ${removed} ngày ngoại lệ ${from === to ? from : `${from} → ${to}`} (về lịch T2–T6 mặc định)` });
  refresh();
  revalidatePath("/admin/attendance");
  return { ok: true, message: `Đã bỏ ${removed} ngày. Đã tính lại ${recalculated} dòng công.` };
}
/** Tính lại toàn bộ công 1 tháng theo cấu hình giờ làm / bảng phạt hiện tại (bỏ qua ngày Admin đã sửa tay). */
export async function recalcAttendanceMonth(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  const admin = await ADMIN_ONLY();
  const month = String(fd.get("month") ?? "");
  if (!isValidMonth(month)) return { error: "Tháng không hợp lệ" };
  const n = await recalcMonth(month);
  await logAudit({ actorId: admin.id, action: "attendance.recalc", targetType: "DailyAttendance", summary: `Tính lại công tháng ${month} theo cấu hình hiện tại (${n} dòng)` });
  revalidatePath("/admin/attendance");
  revalidatePath("/attendance");
  return { ok: true, message: `Đã tính lại ${n} dòng công tháng ${month}. Nhớ bấm “Tính lại” ở Bảng lương nếu đã tính lương tháng này.` };
}

// ───────────────────────── Performance ─────────────────────────

/** Lưu tiêu chí: sửa tên / trọng số / nhóm, thêm mới, xóa (xóa tiêu chí cũng xóa điểm đã sync của tiêu chí đó). */
export async function saveCriteria(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  const admin = await ADMIN_ONLY();
  const parsed = parseCriteria(fd);
  if (parsed.error !== undefined) return { error: parsed.error };

  const { kept, removed } = await applyCriteria(parsed.value);
  await logAudit({ actorId: admin.id, action: "config.update", targetType: "PerformanceCriterion", summary: `Đổi tiêu chí performance (${kept} tiêu chí, xóa ${removed})` });  refresh();
  return { ok: true, message: `Đã lưu tiêu chí.${removed ? " Điểm của các tiêu chí đã xóa cũng bị xóa." : ""} Bấm “Tính lại” ở Bảng lương để áp dụng hệ số mới.` };
}

async function sheetsAction(run: () => Promise<ConfigState>): Promise<ConfigState> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof SheetsError) return { error: e.message };
    console.error(e);
    return { error: "Có lỗi khi làm việc với Google Sheet, vui lòng thử lại." };
  }
}

export async function createPerfTabAction(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  const admin = await ADMIN_ONLY();
  const month = String(fd.get("month") ?? "");
  if (!isValidMonth(month)) return { error: "Tháng không hợp lệ" };
  return sheetsAction(async () => {
    const r = await createPerfTab(month);
    if (!r.created) return { ok: true, message: `Tab "${r.tab}" đã có trong file — giữ nguyên để không ghi đè điểm Leader đã chấm.` };
    await logAudit({ actorId: admin.id, action: "performance.create_tab", targetType: "Sheet", summary: `Tạo tab chấm điểm "${r.tab}" (${r.employees} nhân sự, ${r.criteria} tiêu chí)` });
    return { ok: true, message: `Đã tạo tab "${r.tab}" với ${r.employees} nhân sự và ${r.criteria} tiêu chí. Leader chấm điểm 0–5 rồi bạn bấm “Sync ngay”.` };
  });
}

export async function syncPerfAction(_p: ConfigState, fd: FormData): Promise<ConfigState> {
  const admin = await ADMIN_ONLY();
  const month = String(fd.get("month") ?? "");
  if (!isValidMonth(month)) return { error: "Tháng không hợp lệ" };
  return sheetsAction(async () => {
    const r = await syncPerformanceFromSheet(month);
    await logAudit({ actorId: admin.id, action: "performance.sync", targetType: "PerformanceScore", summary: `Sync điểm performance tháng ${month}: ${r.saved} điểm của ${r.employees} nhân sự` });
    revalidatePath("/admin/config");
    const notes = [
      r.cleared ? `${r.cleared} ô để trống (điểm cũ nếu có đã bị xóa)` : "",
      r.unknown.length ? `Mã NV không có trong hệ thống: ${r.unknown.join(", ")}` : "",
      r.missingCriteria.length ? `Tab không có cột: ${r.missingCriteria.join(", ")} (điểm các tiêu chí này giữ nguyên)` : "",
      ...r.errors,
    ].filter(Boolean);
    return { ok: true, message: `Đã lưu ${r.saved} điểm của ${r.employees} nhân sự. Bấm “Tính lại” ở Bảng lương để áp dụng hệ số mới.${notes.length ? ` Lưu ý: ${notes.join(" • ")}` : ""}` };
  });
}
