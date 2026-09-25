"use client";

import { useActionState, useState } from "react";
import { createRequestAction } from "../actions";

type RequestType = "OT" | "LATE" | "EARLY_LEAVE" | "LEAVE" | "WFH" | "SALARY_ADVANCE";

const LABEL: Record<RequestType, string> = {
  OT: "OT",
  LATE: "Đi muộn",
  EARLY_LEAVE: "Về sớm",
  LEAVE: "Nghỉ",
  WFH: "WFH",
  SALARY_ADVANCE: "Tạm ứng lương",
};

const HINT: Partial<Record<RequestType, string>> = {
  LATE: "Mỗi tháng 3 đơn đi muộn có ngày sớm nhất (đã được duyệt) được miễn phạt.",
  EARLY_LEAVE: "Đơn về sớm chỉ để xin phép — công ngày đó vẫn tính theo số giờ thực tế đã làm.",
  OT: "Phải có đơn OT được duyệt thì mới được tính công OT.",
  SALARY_ADVANCE: "Sau khi được duyệt, số tiền sẽ trừ hết vào lương tháng này.",
};

// Form tạo đơn: các ô hiện ra thay đổi theo loại đơn (spec §5).
export function CreateRequestForm({ types, today }: { types: RequestType[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<RequestType>(types[0]);
  const [portion, setPortion] = useState("FULL");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const sameDay = from === to; // nghỉ nửa ngày chỉ cho đơn 1 ngày
  const [amount, setAmount] = useState("");
  const [round, setRound] = useState(0); // đổi key để xóa form sau khi gửi xong
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof createRequestAction>>, fd: FormData) => {
    const result = await createRequestAction(prev, fd);
    if (result?.ok) {
      setRound((n) => n + 1);
      setAmount("");
      setOpen(false);
    }
    return result;
  }, undefined);

  if (!open) {
    return (
      <div style={{ marginBottom: 14 }}>
        {state?.ok && <div className="ok-box">{state.message}</div>}
        {state?.ok && state.warning && <div className="warn-box">{state.warning}</div>}
        <button type="button" className="btn primary" onClick={() => setOpen(true)}>＋ Tạo đơn</button>
      </div>
    );
  }

  const isRange = type === "LEAVE" || type === "WFH";
  const hasTimes = type === "OT" || type === "LATE" || type === "EARLY_LEAVE";

  return (
    <form action={action} key={round} className="card" style={{ marginBottom: 14 }}>
      <input type="hidden" name="type" value={type} />
      <div className="tabs" style={{ marginBottom: 12 }}>
        {types.map((t) => (
          <button key={t} type="button" className={`btn sm ${t === type ? "primary" : ""}`} onClick={() => setType(t)}>{LABEL[t]}</button>
        ))}
      </div>
      {HINT[type] && <div className="info-box">{HINT[type]}</div>}

      {type === "LEAVE" && (
        <div className="field">
          <label htmlFor="leaveSubtype">Loại nghỉ</label>
          <select id="leaveSubtype" name="leaveSubtype" defaultValue="ANNUAL">
            <option value="ANNUAL">Nghỉ phép</option>
            <option value="UNPAID">Nghỉ không lương</option>
            <option value="MARRIAGE">Nghỉ kết hôn</option>
            <option value="FUNERAL">Nghỉ tang lễ</option>
          </select>
        </div>
      )}

      {hasTimes && (
        <div className="grid3">
          <div className="field"><label htmlFor="dateFrom">Ngày</label><input id="dateFrom" name="dateFrom" type="date" defaultValue={today} required /></div>
          <div className="field"><label htmlFor="timeFrom">{type === "LATE" ? "Dự kiến đến lúc" : "Từ giờ"}</label><input id="timeFrom" name="timeFrom" type="time" required /></div>
          <div className="field"><label htmlFor="timeTo">{type === "LATE" ? "Thời gian đến hết" : "Đến giờ"}</label><input id="timeTo" name="timeTo" type="time" required /></div>
        </div>
      )}

      {isRange && (
        <>
          <div className="grid2">
            <div className="field"><label htmlFor="dateFrom">Từ ngày</label><input id="dateFrom" name="dateFrom" type="date" value={from} required onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} /></div>
            <div className="field"><label htmlFor="dateTo">Đến ngày</label><input id="dateTo" name="dateTo" type="date" value={to} min={from} required onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <div className="field">
            <label htmlFor="dayPortion">Thời gian</label>
            <select id="dayPortion" name="dayPortion" value={sameDay ? portion : "FULL"} disabled={!sameDay} onChange={(e) => setPortion(e.target.value)}>
              <option value="FULL">Cả ngày</option>
              <option value="MORNING">Nửa ngày (sáng)</option>
              <option value="AFTERNOON">Nửa ngày (chiều)</option>
            </select>
            {!sameDay && <small style={{ color: "var(--text-3)" }}>Nghỉ nửa ngày chỉ áp dụng cho đơn 1 ngày.</small>}
          </div>
          {!sameDay && <input type="hidden" name="dayPortion" value="FULL" />}
        </>
      )}

      {type === "SALARY_ADVANCE" && (
        <div className="field">
          <label htmlFor="amount">Số tiền (đ)</label>
          <input id="amount" name="amount" inputMode="numeric" value={amount} onChange={(e) => { const d = e.target.value.replace(/[^\d]/g, ""); setAmount(d ? Number(d).toLocaleString("vi-VN") : ""); }} required />
        </div>
      )}

      <div className="field">
        <label htmlFor="reason">Lý do</label>
        <textarea id="reason" name="reason" rows={3} maxLength={500} required style={{ resize: "vertical" }} />
      </div>

      {state?.error && <div className="warn-box">{state.error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Đang gửi..." : "Gửi đơn"}</button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>Hủy</button>
      </div>
    </form>
  );
}
