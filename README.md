# Hala Games — Chấm công · Lương

Hệ thống chấm công - lương nội bộ, thay thế aCheckin. Nghiệp vụ chi tiết theo file spec `spec-cham-cong-luong.md` và giao diện mẫu `demo.html` (lưu ngoài repo).

## Công nghệ

| Phần | Dùng |
|---|---|
| Web + server | Next.js 16 (TypeScript) |
| Database | PostgreSQL + Prisma 7 |
| Đăng nhập | Email + mật khẩu, phiên lưu trong DB, cookie httpOnly |
| Hosting | Railway |

## Cấu trúc thư mục

```
prisma/schema.prisma      ← Cấu trúc database (mọi bảng)
prisma/migrations/        ← Lịch sử thay đổi database (tự sinh, không sửa tay)
prisma/seed.ts            ← Dữ liệu khởi tạo: 5 team, 8 tiêu chí performance, cấu hình, Admin đầu tiên
src/app/login/            ← Màn đăng nhập
src/app/change-password/  ← Đổi mật khẩu (bắt buộc ở lần đăng nhập đầu)
src/app/(app)/            ← Các màn sau khi đăng nhập (dùng chung khung sidebar + bottom nav)
src/app/(app)/admin/      ← Các màn chỉ Admin vào được
src/app/api/              ← API (mọi API bọc bằng withAuth để kiểm tra quyền trên server)
src/lib/auth/             ← Đăng nhập, phiên, kiểm tra quyền
src/lib/nav.ts            ← Menu theo từng role
src/lib/settings.ts       ← Cấu hình mặc định (bảng phạt, tham số lương, duyệt đơn...)
```

## Phân quyền

- Mọi trang gọi `requireUser()` hoặc `requireRole(...)`; mọi API bọc `withAuth(...)`. Việc kiểm tra quyền chạy trên server (spec §15), không dựa vào việc ẩn nút.
- Nhân sự bị khóa, đã nghỉ hoặc chưa có Role thì không đăng nhập được, và các phiên đang mở cũng mất hiệu lực ngay.
- Mật khẩu mặc định: `Hala@<Mã NV>` (VD `Hala@NV001`), bắt buộc đổi ở lần đăng nhập đầu.
- Nhập sai mật khẩu 5 lần thì bị khóa đăng nhập 15 phút.

---

## Hướng dẫn deploy lên Railway (lần đầu)

1. Vào <https://railway.com>, đăng nhập bằng GitHub.
2. **New Project** → **Deploy from GitHub repo** → chọn repo `hala-cham-cong`.
3. Trong project, bấm **+ Create** → **Database** → **PostgreSQL**. Railway tạo database riêng.
4. Bấm vào service web (tên `hala-cham-cong`) → tab **Variables** → thêm:
   | Tên | Giá trị |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (gõ đúng như vậy, Railway tự điền) |
   | `ADMIN_EMAIL` | Email của bạn, dùng để đăng nhập Admin |
   | `ADMIN_NAME` | Tên hiển thị của bạn |
   | `ADMIN_INITIAL_PASSWORD` | Mật khẩu tạm cho lần đăng nhập đầu (nên đặt, xem mục bảo mật bên dưới) |
5. Tab **Settings** → **Networking** → **Generate Domain**. Railway cấp link dạng `xxx.up.railway.app`.
6. Mỗi lần deploy, Railway tự chạy lần lượt: cập nhật database (migrate), tạo dữ liệu khởi tạo (seed, không ghi đè dữ liệu đã có), rồi khởi động web.
7. Mở link, đăng nhập bằng `ADMIN_EMAIL` với mật khẩu ở `ADMIN_INITIAL_PASSWORD` (nếu không đặt thì là `Hala@ADM`). Hệ thống sẽ bắt đổi mật khẩu ngay.

Sau đó, mỗi lần code mới được đẩy lên nhánh đã kết nối, Railway tự deploy lại.

## Gắn tên miền riêng (VD `hr.halagames-tools.work`)

Cách này **không ảnh hưởng** server đang chạy ở domain chính, vì chỉ thêm 1 subdomain mới.

1. Railway → service web → **Settings** → **Networking** → **+ Custom Domain** → nhập `hr.halagames-tools.work`.
2. Railway hiện ra 1 bản ghi cần thêm, dạng:
   | Loại (Type) | Tên (Name / Host) | Giá trị (Value / Target) |
   |---|---|---|
   | `CNAME` | `hr` | `abc123.up.railway.app` (lấy đúng giá trị Railway đưa) |
   
   Railway có thể yêu cầu thêm 1 bản ghi `TXT` để xác minh (tên dạng `_railway-verify.hr`). Nếu có thì thêm y như Railway ghi.
3. Vào trang quản lý DNS của domain (nơi mua domain, hoặc Cloudflare nếu đang dùng) → **Thêm bản ghi (Add record)** → điền đúng các giá trị trên.
   - Chỉ **thêm mới**, không sửa hay xóa các bản ghi đang có (như `@`, `www`), để server cũ vẫn chạy bình thường.
   - Nếu dùng Cloudflare: để **Proxy status = DNS only** (đám mây màu xám) cho bản ghi này.
4. Chờ 5–30 phút. Railway báo ✅ và tự cấp chứng chỉ HTTPS.

Nếu sau này mua domain mới thì làm y hệt, chỉ thay tên domain.

## Chạy trên máy (dành cho dev)

```bash
cp .env.example .env        # điền DATABASE_URL, ADMIN_EMAIL
npm install
npm run db:migrate          # tạo bảng
npm run db:seed             # dữ liệu khởi tạo (SEED_DEMO=1 để thêm 1 Leader + 1 Nhân viên mẫu)
npm run dev                 # mở http://localhost:3000
```

Các lệnh kiểm tra: `npm run typecheck`, `npm run lint`, `npm run build`.
