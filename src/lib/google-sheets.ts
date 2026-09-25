import "server-only";

import { createSign } from "node:crypto";

// Gọi Google Sheets API bằng tài khoản dịch vụ (service account) — không cần thư viện ngoài.
// Cần biến môi trường GOOGLE_SERVICE_ACCOUNT_JSON (nội dung file khóa JSON tải từ Google Cloud) và
// chia sẻ file Sheet cho email của tài khoản dịch vụ với quyền Editor.
// Chỉ ĐỌC/GHI tab trong 1 file có sẵn — không bao giờ tạo file Sheet mới (spec §9).

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

export class SheetsError extends Error {}

type Account = { client_email: string; private_key: string };

function account(): Account {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new SheetsError("Chưa cấu hình GOOGLE_SERVICE_ACCOUNT_JSON (khóa tài khoản dịch vụ Google).");
  try {
    const parsed = JSON.parse(raw) as Partial<Account>;
    if (!parsed.client_email || !parsed.private_key) throw new Error();
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    throw new SheetsError("GOOGLE_SERVICE_ACCOUNT_JSON không phải file khóa JSON hợp lệ.");
  }
}

/** Email tài khoản dịch vụ — hiện cho Admin biết cần chia sẻ file Sheet cho ai. Null nếu chưa cấu hình. */
export function serviceAccountEmail() {
  try {
    return account().client_email;
  } catch {
    return null;
  }
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken() {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const { client_email, private_key } = account();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iss: client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(private_key);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(signature)}` }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token) throw new SheetsError(`Không đăng nhập được Google (${data.error_description ?? res.status}). Kiểm tra lại khóa tài khoản dịch vụ.`);
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init.headers },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    const email = serviceAccountEmail();
    const hint =
      res.status === 403 || res.status === 404
        ? ` Kiểm tra link file Sheet đúng chưa, và đã chia sẻ file cho ${email ?? "tài khoản dịch vụ"} với quyền Editor chưa.`
        : "";
    throw new SheetsError(`Google Sheets báo lỗi: ${data.error?.message ?? res.status}.${hint}`);
  }
  return data;
}

const range = (tab: string, cells: string) => encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${cells}`);

/** Tên các tab đang có trong file. */
export async function listTabs(spreadsheetId: string) {
  const data = await api<{ sheets?: { properties: { title: string } }[] }>(`${spreadsheetId}?fields=sheets.properties.title`);
  return (data.sheets ?? []).map((s) => s.properties.title);
}

/** Thêm tab mới (mỗi tháng 1 tab "YYYY-MM"). */
export async function addTab(spreadsheetId: string, title: string) {
  await api(`${spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }] }) });
}

/** Đọc giá trị (số giữ nguyên dạng số, không theo định dạng hiển thị). */
export async function readValues(spreadsheetId: string, tab: string, cells: string) {
  const data = await api<{ values?: unknown[][] }>(`${spreadsheetId}/values/${range(tab, cells)}?valueRenderOption=UNFORMATTED_VALUE`);
  return data.values ?? [];
}

/** Xóa vùng rồi ghi lại từ ô A1. Công thức (bắt đầu bằng "=") được Google tính như gõ tay. */
export async function replaceValues(spreadsheetId: string, tab: string, cells: string, values: (string | number)[][]) {
  await api(`${spreadsheetId}/values/${range(tab, cells)}:clear`, { method: "POST", body: "{}" });
  await api(`${spreadsheetId}/values/${range(tab, "A1")}?valueInputOption=USER_ENTERED`, { method: "PUT", body: JSON.stringify({ values }) });
}
