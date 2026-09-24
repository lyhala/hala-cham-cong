import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

const ROUNDS = 10;

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

// Bỏ các ký tự dễ nhầm khi đọc/gõ lại: 0/O, 1/l/I
const LETTERS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";

/**
 * Mật khẩu tạm ngẫu nhiên cho nhân sự mới (VD "k7Rm4xPa2q"). Admin gửi riêng cho từng người;
 * nhân sự bắt buộc đổi ở lần đăng nhập đầu tiên. Không sinh theo Mã NV để đồng nghiệp không đoán được.
 */
export function generateTempPassword(length = 10) {
  const all = LETTERS + DIGITS;
  const chars = [LETTERS[randomInt(LETTERS.length)], DIGITS[randomInt(DIGITS.length)]];
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  // Trộn vị trí (Fisher–Yates)
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// Quy tắc mật khẩu mới: tối thiểu 8 ký tự, có cả chữ và số.
export function validateNewPassword(plain: string): string | null {
  if (plain.length < 8) return "Mật khẩu cần tối thiểu 8 ký tự.";
  if (!/[a-zA-Z]/.test(plain) || !/[0-9]/.test(plain)) return "Mật khẩu cần có cả chữ và số.";
  return null;
}
