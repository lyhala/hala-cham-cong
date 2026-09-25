import { NextResponse, type NextRequest } from "next/server";

// Kiểm tra nhanh: chưa có cookie đăng nhập → chuyển về /login.
// Đây chỉ là lớp ngoài cho nhanh; kiểm tra thật (phiên còn hạn, role) nằm ở từng trang / API trên server.
const PUBLIC_PATHS = ["/login", "/api/health", "/api/webhooks"];

// Header nội bộ mang đường dẫn hiện tại vào Server Component (đọc qua headers() trong session.ts),
// dùng để biết nhân sự đã nghỉ có đang đứng đúng trang /salary hay không.
const PATHNAME_HEADER = "x-pathname";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, pathname);
  const withPathname = () => NextResponse.next({ request: { headers: requestHeaders } });

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return withPathname();

  if (!request.cookies.has("hala_session")) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return withPathname();
}

export const config = {
  // Bỏ qua file tĩnh và ảnh
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
