import bcrypt from "bcryptjs";

const ROUNDS = 10;

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

// Mật khẩu mặc định cho nhân sự mới (spec §9): sinh theo Mã NV, VD NV001 → "Hala@NV001".
// Nhân sự bắt buộc đổi ở lần đăng nhập đầu tiên.
export function defaultPasswordFor(employeeCode: string) {
  return `Hala@${employeeCode.trim().toUpperCase()}`;
}

// Quy tắc mật khẩu mới: tối thiểu 8 ký tự, có cả chữ và số.
export function validateNewPassword(plain: string): string | null {
  if (plain.length < 8) return "Mật khẩu cần tối thiểu 8 ký tự.";
  if (!/[a-zA-Z]/.test(plain) || !/[0-9]/.test(plain)) return "Mật khẩu cần có cả chữ và số.";
  return null;
}
