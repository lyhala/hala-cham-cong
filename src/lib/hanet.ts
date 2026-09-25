import "server-only";

import { prisma } from "@/lib/db";

// Client gọi API Hanet Partner (đăng ký / xóa FaceID... §3.1) có tự làm mới token:
// gặp lỗi hết hạn (returnCode -103) → dùng refresh token lấy access token mới → lưu lại → gọi lại đúng request đó 1 lần.
// Token mới lưu trong bảng Setting (key "hanetTokens") vì Hanet có thể đổi cả refresh token mỗi lần refresh;
// biến môi trường HANET_ACCESS_TOKEN / HANET_REFRESH_TOKEN chỉ là giá trị khởi tạo khi DB chưa có.
// Tài liệu: https://documenter.getpostman.com/view/13088306/TVeqcn2C (returnCode 1 = thành công, -103 = token hết hạn)

// Tài liệu Hanet không ghi rõ địa chỉ này (chỉ dùng biến {{CAMERA_BASE_URL}}); có thể đổi qua HANET_API_BASE
const API_BASE = process.env.HANET_API_BASE ?? "https://partner.hanet.ai";
const TOKEN_URL = "https://oauth.hanet.com/token";
const TOKENS_KEY = "hanetTokens";
const ACCESS_TOKEN_EXPIRED = -103;

type Tokens = { accessToken: string; refreshToken: string };
type Params = Record<string, string | Blob>;

export class HanetError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
  }
}

function credentials() {
  const clientId = process.env.HANET_CLIENT_ID;
  const clientSecret = process.env.HANET_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new HanetError("Chưa cấu hình HANET_CLIENT_ID / HANET_CLIENT_SECRET");
  return { clientId, clientSecret };
}

async function loadTokens(): Promise<Tokens> {
  const row = await prisma.setting.findUnique({ where: { key: TOKENS_KEY } });
  const saved = row?.value as Partial<Tokens> | null | undefined;
  if (saved?.accessToken && saved.refreshToken) return { accessToken: saved.accessToken, refreshToken: saved.refreshToken };

  const accessToken = process.env.HANET_ACCESS_TOKEN;
  const refreshToken = process.env.HANET_REFRESH_TOKEN;
  if (!accessToken || !refreshToken) throw new HanetError("Chưa có token Hanet (HANET_ACCESS_TOKEN / HANET_REFRESH_TOKEN)");
  return { accessToken, refreshToken };
}

async function saveTokens(tokens: Tokens) {
  await prisma.setting.upsert({
    where: { key: TOKENS_KEY },
    create: { key: TOKENS_KEY, value: tokens },
    update: { value: tokens },
  });
}

// Nhiều request cùng gặp hết hạn thì chỉ refresh 1 lần (refresh token dùng xong có thể bị vô hiệu)
let refreshing: Promise<Tokens> | null = null;

async function refreshTokens(staleAccessToken: string): Promise<Tokens> {
  refreshing ??= (async () => {
    try {
      // Có request khác vừa refresh xong → dùng luôn token đó, không refresh lần nữa
      const current = await loadTokens();
      if (current.accessToken !== staleAccessToken) return current;

      const { clientId, clientSecret } = credentials();
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: current.refreshToken,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
      if (!res.ok || !data.access_token) {
        throw new HanetError(`Không làm mới được token Hanet (${data.error_description ?? data.error ?? res.status}). Cần lấy lại token từ Hanet.`);
      }
      const next = { accessToken: data.access_token, refreshToken: data.refresh_token ?? current.refreshToken };
      await saveTokens(next);
      return next;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

type HanetBody = { returnCode?: number; returnMessage?: string; data?: unknown };

async function callOnce(path: string, params: Params, accessToken: string) {
  const all: Params = { ...params, token: accessToken };
  // Có file (đăng ký khuôn mặt) → multipart/form-data; còn lại form-urlencoded
  const hasFile = Object.values(all).some((v) => typeof v !== "string");
  let body: FormData | URLSearchParams;
  if (hasFile) {
    body = new FormData();
    for (const [k, v] of Object.entries(all)) body.append(k, v);
  } else {
    body = new URLSearchParams(all as Record<string, string>);
  }
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body });
  const json = (await res.json().catch(() => null)) as HanetBody | null;
  return { status: res.status, body: json };
}

const isExpired = (r: { status: number; body: HanetBody | null }) => r.status === 401 || r.body?.returnCode === ACCESS_TOKEN_EXPIRED;

/**
 * Gọi 1 endpoint Hanet Partner (POST; token được thêm tự động). Trả về phần `data` của phản hồi.
 * Hết hạn token thì tự refresh và gọi lại 1 lần; lỗi nghiệp vụ khác (returnCode ≠ 1) ném HanetError kèm mã lỗi.
 */
export async function hanetRequest<T = unknown>(path: string, params: Params = {}): Promise<T> {
  let tokens = await loadTokens();
  let result = await callOnce(path, params, tokens.accessToken);

  if (isExpired(result)) {
    tokens = await refreshTokens(tokens.accessToken);
    result = await callOnce(path, params, tokens.accessToken);
  }

  if (result.body?.returnCode !== 1) {
    throw new HanetError(result.body?.returnMessage ?? `Hanet trả lỗi (HTTP ${result.status})`, result.body?.returnCode ?? result.status);
  }
  return result.body.data as T;
}

// ───────────────────────── FaceID ─────────────────────────

export type HanetPlace = { id: number; name: string; address?: string };

/** Danh sách địa điểm của tài khoản Hanet — để lấy placeID (HANET_PLACE_ID). */
export function hanetGetPlaces() {
  return hanetRequest<HanetPlace[]>("/place/getPlaces");
}

/**
 * Đăng ký FaceID. aliasID = Mã NV nội bộ (NV001...) để đối chiếu; webhook sẽ gửi lại aliasID này.
 * Ảnh: JPG/PNG, Hanet yêu cầu đúng 1280×736 (w×h), 1 người, rõ mặt, không đeo khẩu trang. Cần ít nhất 1 camera online.
 * Lỗi thường gặp: -9005 đã tồn tại, -9006 ảnh không hợp lệ, -9007 trùng khuôn mặt, -9008 hết quota FaceID.
 */
export function hanetRegisterPerson(input: { name: string; aliasId: string; placeId: string; title?: string; image: Blob; filename?: string }) {
  const file = new File([input.image], input.filename ?? "face.jpg", { type: input.image.type || "image/jpeg" });
  return hanetRequest("/person/register", {
    name: input.name,
    aliasID: input.aliasId,
    placeID: input.placeId,
    title: input.title ?? "",
    type: "0", // 0 = nhân viên
    file,
  });
}

/** Xóa FaceID theo aliasID (Mã NV) tại 1 địa điểm. */
export function hanetRemovePerson(input: { aliasId: string; placeId: string }) {
  return hanetRequest("/person/removeByPlace", { aliasID: input.aliasId, placeID: input.placeId });
}
