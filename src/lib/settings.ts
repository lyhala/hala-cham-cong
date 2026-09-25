// Cấu hình hệ thống (bảng Setting, dạng key → JSON) và giá trị mặc định theo spec.
// Admin sửa được qua màn Cấu hình (các module sau). Khi DB chưa có key, dùng giá trị mặc định ở đây.

import type { RequestType } from "@/generated/prisma/enums";

export const SETTING_DEFAULTS = {
  // §3.2 — Ca chuẩn. Giờ công chuẩn/ngày (7,5), giờ nghỉ trưa (1,5) và mọi công thức chấm công đều suy ra từ 4 mốc giờ này
  workSchedule: {
    morningStart: "08:30",
    morningEnd: "12:00",
    afternoonStart: "13:30",
    afternoonEnd: "17:30",
    workWeekdays: [1, 2, 3, 4, 5], // T2–T6 (0 = Chủ nhật)
  },

  // §3.3 — Phạt đi muộn lũy tiến. perMinute: đ/phút cho phút nằm trong khung [from, to].
  latePenalty: {
    tiers: [
      { from: "08:31", to: "08:45", perMinute: 1000 },
      { from: "08:46", to: "09:00", perMinute: 2000 },
      { from: "09:01", to: "09:30", perMinute: 3000 },
      { from: "09:31", to: "10:00", perMinute: 5000 },
    ],
    halfDayAfter: "10:00", // Đến sau 10h → trừ 1/2 công
    freeExemptionsPerMonth: 3,
  },

  // §6.1 — Tham số lương
  salaryParams: {
    mealAllowancePerMonth: 1_250_000,
    parkingPerDay: 5_000,
    otCoefficients: { weekday: 1.5, weekend: 2, holiday: 3 },
  },

  // §4 — Phép năm: nhân sự chính thức được 1 ngày/tháng, cộng dồn, không nghỉ ứng trước; tồn cuối năm quy đổi ra lương.
  // probationMonths = số tháng thử việc mặc định (chưa tích lũy phép); từng nhân sự có thể đặt số tháng riêng (0 = bỏ qua thử việc)
  leavePolicy: {
    daysPerMonth: 1,
    probationMonths: 2,
  },

  // §5 — Duyệt 1 cấp (Leader HOẶC Admin) hay 2 cấp (Leader rồi Admin)
  approvalLevels: {
    OT: 2,
    LATE: 1,
    EARLY_LEAVE: 1,
    LEAVE: 1,
    WFH: 1,
    SALARY_ADVANCE: 2,
  } as Record<RequestType, 1 | 2>,

  // §2 — Bật/tắt quyền & nút chức năng theo role
  rolePermissions: {
    leader: { approve: true },
    employee: { wfh: false, advance: true },
  },

  // §14.1 — Dòng hiển thị trên phiếu lương nhân sự thấy
  payslipVisibleLines: {
    baseSalary: true,
    perfSalary: true,
    perfCoefficient: true,
    workUnits: true,
    ot: true,
    mealAllowance: true,
    parkingAllowance: true,
    latePenalty: true,
    advanceDeduction: true,
    leavePayout: true,
  },

  // §11 — Giao diện
  appearance: {
    headerColor: "#12283F",
    backgroundImageUrl: null as string | null,
  },

  // §7 — Gợi ý loại thưởng (gõ loại mới sẽ tự thêm vào)
  bonusTypeSuggestions: ["2/9", "Tết dương", "Thưởng dự án", "Tết âm", "Thưởng nóng"],

  // §17 — Lưu trữ dữ liệu: quá hạn (số tháng) thì job hằng ngày xóa khỏi database (npm run retention)
  retention: {
    payslipMonths: 12, // Phiếu lương
    attendanceMonths: 3, // Log Hanet + bảng công ngày
    allocationMonths: 12, // Hệ số phân bổ dự án (bản trên Google Sheet không bị xóa)
    requestMonths: 3, // Đơn từ
    reportMonths: 12, // Báo cáo Chi phí dự án / theo Team: chỉ cho xem lại tối đa chừng này tháng
  },

  // §9 — Link các Google Sheet. Mỗi luồng (Bảng lương, Hệ số phân bổ, Chi phí dự án) dùng ĐÚNG 1 file cố định
  // ở đây; mỗi tháng chỉ thêm tab mới vào file đó (tên tab = "YYYY-MM"), KHÔNG tạo file Sheet mới.
  googleSheets: {
    employeesSheetUrl: null as string | null,
    performanceSheetUrl: null as string | null,
    payrollSheetUrl: null as string | null,
    allocationSheetUrl: null as string | null,
    projectCostSheetUrl: null as string | null,
    teamCostSheetUrl: null as string | null,
  },
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K];
