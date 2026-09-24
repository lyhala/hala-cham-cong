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
