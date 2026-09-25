// Giả lập webhook Hanet gửi tới app để thử luồng chấm công mà không cần quét mặt thật.
//
// Cách dùng (app phải đang chạy: `npm run dev`, có database, và nhân sự đã có Mã NV):
//   npm run sim:hanet -- list
//   npm run sim:hanet -- <kịch bản> --code NV001 [--date 2026-09-24] [--url http://localhost:3000]
//
// Script tạo đúng gói tin như Hanet (kèm hash = md5(client_secret + id)) rồi POST tới /api/webhooks/hanet.
// Bảng công lưu theo ngày --date (mặc định hôm nay theo giờ VN). Nhân sự nhận diện qua aliasID = Mã NV.

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

type Scan = { at: string; personType?: number };
type Scenario = { desc: string; expect: string; scans: Scan[]; corruptHash?: boolean; personEvent?: boolean };

const SCENARIOS: Record<string, Scenario> = {
  "on-time-full": { desc: "Đến 08:25, về 17:45", expect: "Đủ 1 công, không phạt", scans: [{ at: "08:25" }, { at: "12:01" }, { at: "13:20" }, { at: "17:45" }] },
  "late-20": { desc: "Đến 08:50, về 18:00", expect: "Muộn 20 phút, phạt 25.000đ (15×1.000 + 5×2.000), ~1 công", scans: [{ at: "08:50" }, { at: "18:00" }] },
  "late-45": { desc: "Đến 09:15, về 18:30", expect: "Muộn 45 phút, phạt 15.000 + 30.000 + 15×3.000 = 90.000đ", scans: [{ at: "09:15" }, { at: "18:30" }] },
  "late-after-10": { desc: "Đến 10:20, về 19:30 (không có đơn được miễn)", expect: "Không phạt tiền, trừ 0,5 công", scans: [{ at: "10:20" }, { at: "19:30" }] },
  "short-day": { desc: "Đến 08:30, về 16:00", expect: "Thiếu công: 6/7,5 = 0,8 công", scans: [{ at: "08:30" }, { at: "16:00" }] },
  "no-checkout": { desc: "Chỉ quét 1 lần lúc 08:28", expect: "Có check-in, chưa check-out, 0 công", scans: [{ at: "08:28" }] },
  "multi-scan": { desc: "Quét nhiều lần trong ngày", expect: "Check-in = lần đầu (08:31), check-out = lần cuối (17:40)", scans: [{ at: "17:40" }, { at: "08:31" }, { at: "12:05" }, { at: "13:25" }] },
  stranger: { desc: "Người lạ (personType 2)", expect: "Bị bỏ qua, không ghi log", scans: [{ at: "08:30", personType: 2 }] },
  "bad-hash": { desc: "Sai mã hash", expect: "Server trả 401", scans: [{ at: "08:30" }], corruptHash: true },
  "person-add": { desc: "Hanet báo có FaceID mới (data_type person)", expect: "Gắn personID vào nhân sự có Mã NV = aliasID", scans: [], personEvent: true },
};

// ── đọc tham số ──
const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const name = args[0]; // tên kịch bản là tham số đầu tiên

if (!name || name === "list" || !SCENARIOS[name]) {
  console.log("Các kịch bản:\n");
  for (const [k, s] of Object.entries(SCENARIOS)) console.log(`  ${k.padEnd(14)} ${s.desc}\n  ${" ".repeat(14)} → ${s.expect}\n`);
  process.exit(name && name !== "list" ? 1 : 0);
}

// ── cấu hình ──
const env: Record<string, string> = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const secret = env.HANET_WEBHOOK_SECRET;
if (!secret) throw new Error("Thiếu HANET_WEBHOOK_SECRET trong .env");

const url = `${flag("url", "http://localhost:3000")}/api/webhooks/hanet`;
const code = flag("code", "NV001").toUpperCase();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const date = flag("date", today);
const personId = flag("person-id", `SIM-${code}`); // personID giả của Hanet

async function send(payload: Record<string, unknown>, label: string) {
  const id = randomUUID();
  const hash = createHash("md5").update(secret + id).digest("hex");
  const body = { ...payload, id, hash: SCENARIOS[name].corruptHash ? "0".repeat(32) : hash, keycode: "", placeID: Number(env.HANET_PLACE_ID || 0), placeName: "halagames" };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  console.log(`${label.padEnd(22)} → HTTP ${res.status} ${await res.text()}`);
}

const scenario = SCENARIOS[name];
console.log(`Kịch bản "${name}": ${scenario.desc}\nMong đợi: ${scenario.expect}\nGửi tới ${url} (Mã NV ${code}, ngày ${date})\n`);

if (scenario.personEvent) {
  await send({ action_type: "add", data_type: "person", date: `${date} 08:00:00`, time: Date.now(), personID: personId, aliasID: code, personName: `Giả lập ${code}`, personTitle: "", personType: 0 }, "FaceID mới");
}
for (const scan of scenario.scans) {
  const at = new Date(`${date}T${scan.at}:00+07:00`);
  await send(
    {
      action_type: "update",
      aliasID: code,
      data_type: "log",
      date: `${date} ${scan.at}:00`,
      detected_image_url: "https://static.hanet.ai/face/employee/0/simulated.jpg",
      deviceID: "F2231FV0702",
      deviceName: "F2231FV0702",
      personID: personId,
      personName: `Giả lập ${code}`,
      personTitle: "",
      personType: scan.personType ?? 0,
      mask: -1,
      time: at.getTime(),
    },
    `quét lúc ${scan.at}`,
  );
}
console.log(`\nXem kết quả: đăng nhập Admin → Chấm công toàn công ty → chọn ${code} → ngày ${date}.`);
