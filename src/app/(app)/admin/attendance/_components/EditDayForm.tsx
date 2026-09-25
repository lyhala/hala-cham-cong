"use client";

import { useActionState, useState } from "react";
import { resetAttendanceDay, saveAttendanceDay } from "../actions";

type Props = {
  employeeId: string;
  day: string;
  checkIn: string; // "HH:mm" hoặc ""
  checkOut: string;
  workUnits: number;
  note: string;
  isManual: boolean;
};

// Form Admin sửa công 1 ngày. Trống ô "Số công" = hệ thống tự tính từ giờ vào/ra theo quy tắc §3.2–3.3.
export function EditDayForm({ employeeId, day, checkIn, checkOut, workUnits, note, isManual }: Props) {
  const [open, setOpen] = useState(false);
  const [saved, save, saving] = useActionState(saveAttendanceDay, undefined);
  const [reset, resetAction, resetting] = useActionState(resetAttendanceDay, undefined);
  const result = saved ?? reset;

  if (!open) {
    return (
      <div style={{ marginTop: 12 }}>
        {result?.ok && <div className="ok-box">{result.message}</div>}
        <button type="button" className="btn sm" onClick={() => setOpen(true)}>Sửa công ngày này</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      {/* key theo ngày để form nạp lại dữ liệu khi chọn ngày khác */}
      <form action={save} key={day}>
        <input type="hidden" name="employeeId" value={employeeId} />
        <input type="hidden" name="day" value={day} />
        <div className="grid2">
          <div className="field">
            <label htmlFor="checkIn">Giờ vào</label>
            <input id="checkIn" name="checkIn" type="time" defaultValue={checkIn} />
          </div>
          <div className="field">
            <label htmlFor="checkOut">Giờ ra</label>
            <input id="checkOut" name="checkOut" type="time" defaultValue={checkOut} />
          </div>
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="workUnits">Số công (để trống = tự tính)</label>
            <input id="workUnits" name="workUnits" inputMode="decimal" placeholder={`Hiện tại: ${workUnits}`} />
          </div>
          <div className="field">
            <label htmlFor="note">Ghi chú / lý do sửa</label>
            <input id="note" name="note" defaultValue={note} placeholder="VD: Quên quẹt mặt" />
          </div>
        </div>
        {result?.error && <div className="warn-box">{result.error}</div>}
        {result?.ok && <div className="ok-box">{result.message}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn sm primary" type="submit" disabled={saving || resetting}>
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
          <button type="button" className="btn sm" onClick={() => setOpen(false)}>Đóng</button>
        </div>
      </form>
      {isManual && (
        <form
          action={resetAction}
          style={{ marginTop: 8 }}
          onSubmit={(e) => {
            if (!window.confirm("Bỏ chỉnh sửa tay và tính lại từ dữ liệu Hanet?")) e.preventDefault();
          }}
        >
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="day" value={day} />
          <button className="btn sm danger" type="submit" disabled={saving || resetting}>
            {resetting ? "..." : "Bỏ sửa tay, lấy lại từ Hanet"}
          </button>
        </form>
      )}
    </div>
  );
}
