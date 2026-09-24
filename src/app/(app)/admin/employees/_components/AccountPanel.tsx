"use client";

import { startTransition, useActionState, useState } from "react";
import { deleteEmployee, markResigned, reactivate, resetPassword, setLocked } from "../actions";
import { ActionButton } from "./ActionButton";

type Props = {
  id: string;
  name: string;
  hasEmail: boolean;
  isLocked: boolean;
  resigned: boolean;
  isSelf: boolean;
  today: string;
};

// Các thao tác tài khoản trong hồ sơ nhân sự: reset mật khẩu, khóa, nghỉ việc, xóa hẳn.
export function AccountPanel({ id, name, hasEmail, isLocked, resigned, isSelf, today }: Props) {
  const [showResign, setShowResign] = useState(false);
  const [resignState, resignAction, resignPending] = useActionState(markResigned, undefined);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteEmployee, undefined);

  if (isSelf) {
    return (
      <p style={{ fontSize: 12.5, color: "var(--text-2)" }}>
        Đây là tài khoản của bạn. Đổi mật khẩu ở mục Hồ sơ cá nhân.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!resigned && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {hasEmail ? (
            <ActionButton
              action={resetPassword}
              fields={{ id }}
              label="🔑 Reset mật khẩu"
              confirm={`Tạo mật khẩu tạm mới cho ${name}? Mật khẩu cũ sẽ không dùng được nữa và ${name} bị đăng xuất khỏi mọi thiết bị.`}
            />
          ) : (
            <span style={{ fontSize: 12, color: "var(--danger)" }}>Chưa có email — nhập email để nhân sự đăng nhập được.</span>
          )}
          <ActionButton
            action={setLocked}
            fields={{ id, locked: isLocked ? "0" : "1" }}
            label={isLocked ? "🔓 Mở khóa tài khoản" : "🔒 Khóa tài khoản"}
            confirm={isLocked ? undefined : `Khóa tài khoản ${name}? Người này sẽ bị đăng xuất và không đăng nhập được.`}
          />
          {!showResign && (
            <button type="button" className="btn sm danger" onClick={() => setShowResign(true)}>
              Nghỉ việc
            </button>
          )}
        </div>
      )}

      {!resigned && showResign && (
        <form
          className="card"
          style={{ background: "var(--bg)" }}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => resignAction(fd));
          }}
        >
          <input type="hidden" name="id" value={id} />
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Đánh dấu {name} đã nghỉ việc</div>
          <ul style={{ fontSize: 12, color: "var(--text-2)", paddingLeft: 18, marginBottom: 10, lineHeight: 1.7 }}>
            <li>Tự khóa tài khoản đăng nhập, ẩn khỏi danh sách đang làm</li>
            <li>Vẫn giữ dữ liệu để tính lương tháng cuối; xuất lương xong thì bấm &quot;Xóa hẳn&quot;</li>
            <li>Nhắc việc làm tay: khóa / xóa email công ty của người này</li>
          </ul>
          <div className="field">
            <label htmlFor="leftAt">Ngày nghỉ việc</label>
            <input id="leftAt" name="leftAt" type="date" defaultValue={today} required />
          </div>
          {resignState?.error && <div className="warn-box">{resignState.error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn sm primary danger" type="submit" disabled={resignPending}>
              {resignPending ? "..." : "Xác nhận nghỉ việc"}
            </button>
            <button type="button" className="btn sm" onClick={() => setShowResign(false)}>
              Hủy
            </button>
          </div>
        </form>
      )}

      {resigned && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ActionButton action={reactivate} fields={{ id }} label="↩︎ Đi làm lại" confirm={`Chuyển ${name} về Đang làm và mở khóa tài khoản?`} />
        </div>
      )}

      <form
        action={deleteAction}
        onSubmit={(e) => {
          const typed = window.prompt(
            `XÓA HẲN ${name} khỏi app, kèm toàn bộ chấm công, đơn từ, phiếu lương, thưởng của người này. Không khôi phục được.\n\nHãy chắc đã xuất lương ra Google Sheet. Gõ XOA để xác nhận:`,
          );
          if (typed?.trim().toUpperCase() !== "XOA") e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button className="btn sm danger" type="submit" disabled={deletePending}>
          {deletePending ? "Đang xóa..." : "🗑 Xóa hẳn khỏi app"}
        </button>
        {deleteState?.error && <div className="warn-box" style={{ marginTop: 8 }}>{deleteState.error}</div>}
      </form>
    </div>
  );
}
