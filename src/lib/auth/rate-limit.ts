// Chống dò mật khẩu: sai quá MAX_FAILS lần trong WINDOW_MS thì khóa tạm.
// Lưu trong bộ nhớ server — đủ dùng khi chạy 1 instance trên Railway.
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const fails = new Map<string, { count: number; first: number }>();

export function isRateLimited(key: string) {
  const entry = fails.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    fails.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILS;
}

export function recordFailure(key: string) {
  const entry = fails.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    fails.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count++;
  }
}

export function clearFailures(key: string) {
  fails.delete(key);
}
