import "server-only";

import { prisma } from "@/lib/db";
import { SETTING_DEFAULTS, type SettingKey, type SettingValue } from "@/lib/settings";

/** Đọc 1 cấu hình; chưa có trong DB thì trả giá trị mặc định. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return (row?.value as SettingValue<K> | undefined) ?? SETTING_DEFAULTS[key];
}
