import { prisma } from "@/lib/db";

// Railway gọi để kiểm tra app còn sống + kết nối được database.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
