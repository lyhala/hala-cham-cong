import "server-only";

import { prisma } from "@/lib/db";

// Client gọi API Hanet Partner (đăng ký / xóa FaceID... §3.1) có tự làm mới token:
// gặp lỗi hết hạn → dùng refresh token lấy access token mới → lưu lại → gọi lại đúng request đó 1 lần.
// Token mới lưu trong bảng Setting (key "hanetTokens") vì Hanet đổi cả refresh token mỗi lần refresh;
// biến môi trường HANET_ACCESS_TOKEN / HANET_REFRESH_TOKEN chỉ là giá trị khởi tạo khi DB chưa có.

const API_BASE = "https://partner.hanet.ai";
const TOKEN_URL = "https://oauth.hanet.com/token";
const TOKENS_KEY = "hanetTokens";

type Tokens = { accessToken: string; refreshToken: string };

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

// Nhiều request cùng gặp hết hạn thì chỉ refresh 1 lần (refresh token của Hanet dùng xong có thể bị vô hiệu)
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

/** Lỗi "token hết hạn / không hợp lệ": HTTP 401, hoặc Hanet trả 200 kèm thông báo về token. */
function isUnauthorized(status: number, body: unknown) {
  if (status === 401) return true;
  if (typeof body !== "object" || body === null) return false;
  const { returnCode, returnMessage } = body as { returnCode?: unknown; returnMessage?: unknown };
  return returnCode === 401 || /token|unauthori[sz]ed|expired/i.test(String(returnMessage ?? ""));
}

async function callOnce(path: string, params: Record<string, string>, accessToken: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, token: accessToken }),
  });
  const body = (await res.json().catch(() => null)) as unknown;
  return { status: res.status, body };
}

/**
 * Gọi 1 endpoint Hanet Partner (POST, form-urlencoded; token được thêm tự động).
 * Hết hạn token thì tự refresh và gọi lại 1 lần; lỗi nghiệp vụ khác ném HanetError.
 */
export async function hanetRequest<T = Record<string, unknown>>(path: string, params: Record<string, string> = {}): Promise<T> {
  let tokens = await loadTokens();
  let result = await callOnce(path, params, tokens.accessToken);

  if (isUnauthorized(result.status, result.body)) {
    tokens = await refreshTokens(tokens.accessToken);
    result = await callOnce(path, params, tokens.accessToken);
  }

  const { returnCode, returnMessage } = (result.body ?? {}) as { returnCode?: number; returnMessage?: string };
  if (result.status >= 400 || isUnauthorized(result.status, result.body) || (typeof returnCode === "number" && returnCode < 0)) {
    throw new HanetError(returnMessage ?? `Hanet trả lỗi (HTTP ${result.status})`, returnCode ?? result.status);
  }
  return result.body as T;
}
