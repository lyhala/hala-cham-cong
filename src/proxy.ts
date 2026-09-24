import { NextResponse, type NextRequest } from "next/server";

// Kiểm tra nhanh: chưa có cookie đăng nhập → chuyển về /login.
// Đây chỉ là lớp ngoài cho nhanh; kiểm tra thật (phiên còn hạn, role) nằm ở từng trang / API trên server.
const PUBLIC_PATHS = ["/login", "/api/health", "/api/webhooks"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  if (!request.cookies.has("hala_session")) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Bỏ qua file tĩnh và ảnh
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
