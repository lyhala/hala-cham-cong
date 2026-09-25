// Phép năm (spec §4). Hàm thuần, không đụng DB.
//
// - Nhân sự làm từ đầu năm (đã qua thử việc): đủ 12 ngày phép của cả năm.
// - Nhân sự mới vào: phải qua thời gian thử việc (mặc định 2 tháng) mới có phép; tháng vào làm là tháng thứ 1
//   nên từ THÁNG THỨ 3 mới tính phép. Phép năm đó = số tháng được tính phép trong năm × (12 ngày ÷ 12).
// - Trường hợp đặc biệt (cờ "Bỏ qua thử việc" trong hồ sơ): tính phép ngay từ tháng vào làm.

import { shiftMonth } from "@/lib/dates";
import type { SettingValue } from "@/lib/settings";

export type LeavePolicy = SettingValue<"leavePolicy">;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Tháng đầu tiên "YYYY-MM" được tính phép. Chưa có ngày vào làm → coi như nhân sự lâu năm (luôn được tính). */
export function leaveEligibleFrom(joinedAt: string | null, skipProbation: boolean, policy: LeavePolicy) {
  if (!joinedAt) return "0000-01";
  const joinMonth = joinedAt.slice(0, 7);
  return skipProbation ? joinMonth : shiftMonth(joinMonth, policy.probationMonths);
}

/** Số ngày phép năm được hưởng trong năm `year`: mỗi tháng đủ điều kiện được (daysPerYear ÷ 12), đủ cả năm = daysPerYear. */
export function annualLeaveEntitlement(year: number, eligibleFrom: string, policy: LeavePolicy) {
  let months = 0;
  for (let m = 1; m <= 12; m++) if (`${year}-${String(m).padStart(2, "0")}` >= eligibleFrom) months++;
  return round2((policy.daysPerYear * months) / 12);
}

/**
 * Kiểm tra đơn nghỉ phép có vượt phép năm không. Trả về thông báo lỗi tiếng Việt, hoặc null nếu đủ phép.
 * `used`: số ngày phép đã dùng + đang chờ duyệt trong năm (chưa gồm đơn này); `needed`: số ngày của đơn này trong năm đó.
 */
export function annualLeaveShortage(input: { year: number; entitlement: number; used: number; needed: number; eligibleFrom: string; leaveFromMonth?: string }) {
  const { year, entitlement, used, needed, eligibleFrom, leaveFromMonth } = input;
  // Ngày nghỉ rơi vào thời gian thử việc (trước tháng được tính phép) thì không dùng phép năm được, dù cả năm có phép
  if (leaveFromMonth && leaveFromMonth < eligibleFrom) {
    return `Bạn đang trong thời gian thử việc nên chưa được nghỉ phép năm trước tháng ${eligibleFrom.slice(5)}/${eligibleFrom.slice(0, 4)}. Hãy chọn "Nghỉ không lương" hoặc chọn ngày nghỉ từ tháng đó.`;
  }
  if (entitlement === 0) {
    return eligibleFrom > `${year}-12`
      ? `Bạn đang trong thời gian thử việc nên chưa có phép năm (được tính phép từ tháng ${eligibleFrom.slice(5)}/${eligibleFrom.slice(0, 4)}). Hãy chọn "Nghỉ không lương".`
      : `Bạn không có phép năm ${year}. Hãy chọn "Nghỉ không lương".`;
  }
  const remaining = round2(entitlement - used);
  if (needed > remaining) {
    return `Không đủ phép năm ${year}: còn ${Math.max(0, remaining)} ngày (được ${entitlement}, đã dùng / đang chờ duyệt ${used}), đơn này cần ${needed} ngày. Hãy chọn "Nghỉ không lương" cho phần vượt.`;
  }
  return null;
}
