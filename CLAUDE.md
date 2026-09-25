@AGENTS.md

# Dự án: Chấm công - Lương Hala Games

- Nghiệp vụ đã chốt trong file spec `spec-cham-cong-luong.md`, UI mẫu `demo.html` (không nằm trong repo — xin người dùng đính kèm khi làm module mới).
- Người dùng không biết code: giải thích ngắn gọn bằng tiếng Việt, hỏi xác nhận trước các quyết định lớn.
- Giao diện, text, comment trong code: tiếng Việt. Tên biến/hàm/route: tiếng Anh.
- Phân quyền luôn ở server: trang gọi `requireUser()`/`requireRole()`, API bọc `withAuth()` (`src/lib/auth`).
- Tiền: Int (VNĐ). Tháng: "YYYY-MM". Ngày giờ hiển thị theo giờ VN qua `src/lib/dates.ts`.
- Thao tác nhạy cảm (duyệt đơn, sửa công, sửa lương, cấu hình) phải ghi `logAudit()`.
- Đổi database: sửa `prisma/schema.prisma` rồi `npm run db:migrate -- --name <tên>`; không sửa migration cũ.
- Trước khi commit: `npm run typecheck && npm run lint && npm run build`.
- Lưu trữ dữ liệu (spec §17): job `npm run retention` (cron hằng ngày) xóa dữ liệu quá hạn — cấu hình ở `SETTING_DEFAULTS.retention`, logic ở `src/lib/retention.ts`. Báo cáo chi phí phải gọi `reportMonthAvailability()` trước khi tính.
- Đồng bộ Google Sheet: mỗi luồng (Bảng lương, Hệ số phân bổ, Chi phí dự án) chỉ dùng 1 file cố định lấy từ `googleSheets` trong cấu hình; mỗi tháng chỉ thêm tab mới `YYYY-MM`, không bao giờ tạo file Sheet mới.
