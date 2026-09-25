import { createHash, timingSafeEqual } from "node:crypto";
import { recordHanetLog } from "@/lib/attendance";

// Webhook Hanet gửi log quét mặt (§3.1). Đường dẫn /api/webhooks/* là công khai (không cần đăng nhập),
// nên bảo mật bằng mã hash: Hanet gửi hash = md5(client_secret + id) → server tính lại và so khớp.
// Cần đặt biến môi trường HANET_WEBHOOK_SECRET (client_secret lấy từ Hanet).

function verifyHash(id: string, hash: string, secret: string) {
  const expected = createHash("md5").update(secret + id).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(hash.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

// Hanet có thể gọi GET để kiểm tra địa chỉ webhook còn sống khi đăng ký.
export async function GET() {
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const secret = process.env.HANET_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Chưa cấu hình HANET_WEBHOOK_SECRET" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const id = String(body.id ?? "");
  const hash = String(body.hash ?? "");
  if (!id || !hash || !verifyHash(id, hash, secret)) {
    return Response.json({ error: "Sai mã xác thực" }, { status: 401 });
  }

  // Chỉ xử lý log quét mặt; các loại sự kiện khác trả 200 để Hanet không gửi lại.
  if (body.data_type !== "log") return Response.json({ ok: true, ignored: true });

  const personId = String(body.personID ?? "").trim();
  const time = new Date(Number(body.time));
  if (!personId || Number.isNaN(time.getTime())) return Response.json({ ok: true, ignored: true });

  const result = await recordHanetLog({
    hanetPersonId: personId,
    deviceId: body.deviceID ? String(body.deviceID) : null,
    time,
    imageUrl: body.detected_image_url ? String(body.detected_image_url) : null,
    raw: body,
  });
  return Response.json({ ok: true, status: result.status });
}
