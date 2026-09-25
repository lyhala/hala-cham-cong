import { createHash, timingSafeEqual } from "node:crypto";
import { linkHanetPerson, recordHanetLog } from "@/lib/attendance";

// Webhook Hanet gửi log quét mặt (§3.1). Đường dẫn /api/webhooks/* là công khai (không cần đăng nhập),
// nên bảo mật bằng mã hash: Hanet gửi hash = md5(client_secret + id) → server tính lại và so khớp
// (đúng theo tài liệu Hanet "Webhook Push Data"). Cần biến môi trường HANET_WEBHOOK_SECRET = client_secret.

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

  const personId = String(body.personID ?? "").trim();
  const aliasId = String(body.aliasID ?? "").trim() || null;

  // FaceID được thêm/sửa (kể cả đăng ký bằng app Hanet): gắn personID của Hanet vào nhân sự có Mã NV = aliasID
  if (body.data_type === "person") {
    if (personId && aliasId && body.action_type !== "delete") await linkHanetPerson(personId, aliasId);
    return Response.json({ ok: true });
  }

  // Chỉ xử lý log quét mặt của NHÂN VIÊN (personType 0). Khách (1), người lạ (2–5), ảnh chụp (6), báo cháy (28)... bỏ qua.
  // Các loại sự kiện khác cũng trả 200 để Hanet không gửi lại.
  if (body.data_type !== "log" || Number(body.personType) !== 0) return Response.json({ ok: true, ignored: true });

  const time = new Date(Number(body.time));
  if (!personId || Number.isNaN(time.getTime())) return Response.json({ ok: true, ignored: true });

  const result = await recordHanetLog({
    hanetPersonId: personId,
    aliasId,
    deviceId: body.deviceID ? String(body.deviceID) : null,
    time,
    imageUrl: body.detected_image_url ? String(body.detected_image_url) : null,
    raw: body,
  });
  return Response.json({ ok: true, status: result.status });
}
