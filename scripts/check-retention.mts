// Kiểm tra các mốc lưu trữ dữ liệu (spec §17) — không cần database. Chạy: npm run check:retention

import { reportMonthAvailability, retentionCutoffs } from "../src/lib/retention";
import { SETTING_DEFAULTS } from "../src/lib/settings";

const config = SETTING_DEFAULTS.retention;
const now = new Date("2026-09-25T03:00:00Z"); // 25/09/2026 (giờ VN)
const cut = retentionCutoffs(config, now);

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok ? "" : ` — mong đợi ${JSON.stringify(want)}, nhận ${JSON.stringify(got)}`}`);
}

check("Phiếu lương: giữ từ 2025-09, xóa trước đó", cut.payslipMonth, "2025-09");
check("Hệ số phân bổ: giữ từ 2025-09", cut.allocationMonth, "2025-09");
check("Chấm công: giữ từ 2026-06, xóa trước 01/06", cut.attendanceMonth, "2026-06");
check("Mốc xóa bảng công (Date)", cut.attendanceDate.toISOString(), "2026-06-01T00:00:00.000Z");
check("Mốc xóa log Hanet (0h VN = 17h UTC hôm trước)", cut.attendanceTime.toISOString(), "2026-05-31T17:00:00.000Z");
check("Đơn từ: giữ từ 2026-06", cut.requestMonth, "2026-06");
check("Đơn nghỉ phép năm giữ từ đầu năm trước (01/01/2025) để tính phép tồn", cut.annualLeaveKeepFrom.toISOString(), "2025-01-01T00:00:00.000Z");
check("Qua năm 2027: giữ đơn nghỉ phép năm từ 01/01/2026", retentionCutoffs(config, new Date("2027-01-10T03:00:00Z")).annualLeaveKeepFrom.toISOString(), "2026-01-01T00:00:00.000Z");

// Qua năm: 01/2027 → giữ chấm công từ 10/2026, lương từ 01/2026
const jan = retentionCutoffs(config, new Date("2027-01-10T03:00:00Z"));
check("Qua năm: chấm công từ 2026-10", jan.attendanceMonth, "2026-10");
check("Qua năm: phiếu lương từ 2026-01", jan.payslipMonth, "2026-01");

// Báo cáo xem lại tối đa 12 tháng
check("Báo cáo tháng 2025-09 còn xem được", reportMonthAvailability("2025-09", config, now).available, true);
check("Báo cáo tháng 2025-08 quá hạn", reportMonthAvailability("2025-08", config, now).available, false);
check("Báo cáo tháng hiện tại xem được", reportMonthAvailability("2026-09", config, now).available, true);

console.log(failed ? `\n${failed} lỗi` : "\nTất cả đều đúng");
process.exit(failed ? 1 : 0);
