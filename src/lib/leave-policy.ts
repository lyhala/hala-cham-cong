// Phép năm (spec §4). Hàm thuần, không đụng DB.
//
// - Nhân sự chính thức (đã qua thử việc) được 1 ngày phép mỗi tháng; không dùng thì CỘNG DỒN sang tháng sau.
// - KHÔNG nghỉ ứng trước: chỉ được dùng số phép đã tích lũy tính đến hết tháng của ngày nghỉ.
// - Thử việc: số tháng riêng từng người (1, 2, 3... tháng; 0 = bỏ qua thử việc), không điền thì dùng mặc định của công ty.
//   Tháng vào làm là tháng thứ 1 — thử việc 2 tháng thì từ tháng thứ 3 mới tích lũy phép.
// - Phép tồn cuối năm được QUY ĐỔI RA LƯƠNG (không chuyển sang năm sau), nên mỗi năm tích lũy lại từ đầu.

import { shiftMonth } from "@/lib/dates";
import type { SettingValue } from "@/lib/settings";

export type LeavePolicy = SettingValue<"leavePolicy">;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Tháng đầu tiên "YYYY-MM" được tích lũy phép. `probationMonths` của nhân sự: null = dùng mặc định công ty, 0 = bỏ qua thử việc.
 * Chưa có ngày vào làm → coi như nhân sự lâu năm (luôn được tích lũy).
 */
export function leaveEligibleFrom(joinedAt: string | null, probationMonths: number | null, policy: LeavePolicy) {
  if (!joinedAt) return "0000-01";
  return shiftMonth(joinedAt.slice(0, 7), probationMonths ?? policy.probationMonths);
}

/**
 * Số ngày phép đã tích lũy trong năm `year` tính đến hết tháng `uptoMonth` (1–12): mỗi tháng đủ điều kiện được `daysPerMonth`.
 * Tháng ĐẦU tiên được tích lũy của nhân sự mới (`eligibleFrom`) phụ thuộc ngày vào làm (`joinDay`): vào làm từ ngày
 * `firstMonthCutoffDay` trở về trước → đủ 1 tháng (làm tròn thành daysPerMonth); vào sau ngày đó → chỉ `firstMonthPartialDays`.
 * Từ tháng tiếp theo tính bình thường. Không truyền `joinDay` (nhân sự lâu năm / chưa có ngày vào làm) → tính đủ mọi tháng.
 */
export function annualLeaveAccrued(input: { year: number; uptoMonth: number; eligibleFrom: string; policy: LeavePolicy; joinDay?: number | null }) {
  const { year, uptoMonth, eligibleFrom, policy, joinDay } = input;
  let total = 0;
  for (let m = 1; m <= Math.min(12, uptoMonth); m++) {
    const month = `${year}-${String(m).padStart(2, "0")}`;
    if (month < eligibleFrom) continue;
    const isFirstMonth = month === eligibleFrom && joinDay != null;
    total += isFirstMonth && joinDay > policy.firstMonthCutoffDay ? Math.min(policy.firstMonthPartialDays, policy.daysPerMonth) : policy.daysPerMonth;
  }
  return round2(total);
}

/** Tháng (1–12) tính đến đâu của năm `year` tại thời điểm `nowMonth` "YYYY-MM": năm cũ = 12, năm sau = 0, năm nay = tháng hiện tại. */
export function accrualUptoMonth(year: number, nowMonth: string) {
  const [ny, nm] = nowMonth.split("-").map(Number);
  return year < ny ? 12 : year > ny ? 0 : nm;
}

/**
 * Kiểm tra đơn nghỉ phép có hợp lệ không. Trả về thông báo lỗi tiếng Việt, hoặc null nếu được nghỉ.
 * `accrued`: phép tích lũy đến hết tháng của ngày nghỉ cuối trong năm; `used`: phép đã dùng + đang chờ duyệt trong năm
 * (chưa gồm đơn này); `needed`: số ngày của đơn này trong năm đó; `leaveFromMonth`: tháng của ngày nghỉ đầu tiên.
 */
export function annualLeaveShortage(input: { year: number; accrued: number; used: number; needed: number; eligibleFrom: string; leaveFromMonth: string; uptoMonth: number }) {
  const { year, accrued, used, needed, eligibleFrom, leaveFromMonth, uptoMonth } = input;
  const from = `${eligibleFrom.slice(5)}/${eligibleFrom.slice(0, 4)}`;
  // Ngày nghỉ rơi vào thời gian thử việc (trước tháng bắt đầu tích lũy phép)
  if (leaveFromMonth < eligibleFrom) {
    return `Bạn đang trong thời gian thử việc nên chưa được nghỉ phép năm trước tháng ${from}. Hãy chọn "Nghỉ không lương" hoặc chọn ngày nghỉ từ tháng đó.`;
  }
  const remaining = round2(accrued - used);
  if (needed > remaining) {
    return `Không đủ phép: đến hết tháng ${uptoMonth}/${year} bạn tích lũy được ${accrued} ngày, đã dùng / đang chờ duyệt ${used}, còn ${Math.max(0, remaining)} ngày, đơn này cần ${needed} ngày. Không được nghỉ ứng trước phép — hãy chọn "Nghỉ không lương" cho phần vượt hoặc chờ tháng sau.`;
  }
  return null;
}

/** Phép tồn cần quy đổi ra lương: phép đã tích lũy trừ phép ĐÃ nghỉ (đơn đã duyệt), không âm. */
export function leaveDaysToPayOut(accrued: number, usedApproved: number) {
  return Math.max(0, round2(accrued - usedApproved));
}

/** Tiền quy đổi phép tồn = lương base ÷ ngày công chuẩn của tháng chi trả × số ngày phép tồn (làm tròn về đồng). */
export function leavePayoutAmount(baseSalary: number, standardDays: number, days: number) {
  return standardDays > 0 ? Math.round((baseSalary / standardDays) * days) : 0;
}
