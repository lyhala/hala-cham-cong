"use client";

import { startTransition, useActionState, useState } from "react";
import { createTeam, deleteTeam, updateTeam } from "../actions";

function TypeRadios({ defaultValue }: { defaultValue?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 10 }}>
      <label className="check-row" style={{ padding: "4px 0" }}>
        <input type="radio" name="type" value="PRODUCTION" defaultChecked={defaultValue === "PRODUCTION"} required />
        <span>Team sản xuất<small>Chọn được làm Team in-charge dự án, có báo cáo chi phí riêng</small></span>
      </label>
      <label className="check-row" style={{ padding: "4px 0" }}>
        <input type="radio" name="type" value="SUPPORT" defaultChecked={defaultValue === "SUPPORT"} required />
        <span>Team hỗ trợ<small>Mặc định tham gia mọi dự án Active, không làm Team in-charge</small></span>
      </label>
    </div>
  );
}

// Nút + form "Tạo team mới" (bắt buộc chọn loại)
export function CreateTeamForm() {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState(async (prev: Awaited<ReturnType<typeof createTeam>>, fd: FormData) => {
    const result = await createTeam(prev, fd);
    if (result?.ok) setOpen(false);
    return result;
  }, undefined);

  if (!open) {
    return (
      <>
        <button type="button" className="btn sm" onClick={() => setOpen(true)}>+ Tạo team</button>
        {state?.ok && <span style={{ fontSize: 12, color: "var(--success)" }}>{state.message}</span>}
      </>
    );
  }
  return (
    <form
      className="card"
      style={{ width: "100%", maxWidth: 420 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => dispatch(fd));
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 10 }}>Tạo team mới</div>
      <div className="field">
        <label htmlFor="new-team-name">Tên team</label>
        <input id="new-team-name" name="name" required autoFocus />
      </div>
      <TypeRadios />
      {state?.error && <div className="warn-box">{state.error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn sm primary" type="submit" disabled={pending}>{pending ? "..." : "Tạo team"}</button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>Hủy</button>
      </div>
    </form>
  );
}

// Đổi tên / đổi loại / xóa 1 team (hiện trong thẻ team ở sơ đồ tổ chức)
type PersonOption = { id: string; name: string; code: string };

export function TeamEditor({
  team,
  people,
}: {
  team: { id: string; name: string; type: string; memberCount: number; displayLeaderId: string | null };
  people: PersonOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState(async (prev: Awaited<ReturnType<typeof updateTeam>>, fd: FormData) => {
    const result = await updateTeam(prev, fd);
    if (result?.ok) setOpen(false);
    return result;
  }, undefined);
  const [delState, delAction, delPending] = useActionState(deleteTeam, undefined);

  if (!open) {
    return (
      <button type="button" className="btn sm" style={{ marginTop: 6 }} onClick={() => setOpen(true)}>
        ✎ Sửa team
      </button>
    );
  }
  return (
    <div style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => dispatch(fd));
        }}
      >
        <input type="hidden" name="id" value={team.id} />
        <div className="field">
          <label htmlFor={`team-name-${team.id}`}>Tên team</label>
          <input id={`team-name-${team.id}`} name="name" defaultValue={team.name} required />
        </div>
        <TypeRadios defaultValue={team.type} />
        <div className="field">
          <label htmlFor={`team-leader-${team.id}`}>Leader hiển thị</label>
          <select id={`team-leader-${team.id}`} name="displayLeaderId" defaultValue={team.displayLeaderId ?? ""}>
            <option value="">— Theo Leader phân quyền —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>
            Chỉ để hiển thị trên sơ đồ và hồ sơ nhân sự, không cấp quyền duyệt đơn. Chọn được bất kỳ ai (VD CEO).
          </div>
        </div>
        {state?.error && <div className="warn-box">{state.error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm primary" type="submit" disabled={pending}>{pending ? "..." : "Lưu"}</button>
          <button type="button" className="btn sm" onClick={() => setOpen(false)}>Hủy</button>
        </div>
      </form>
      <form
        action={delAction}
        style={{ marginTop: 10 }}
        onSubmit={(e) => {
          const msg =
            `Xóa team "${team.name}"?` +
            (team.memberCount ? `\n${team.memberCount} nhân sự trong team sẽ chuyển về "Chưa chọn".` : "") +
            `\nDự án do team này in-charge sẽ thành "Chưa có team in-charge".`;
          if (!window.confirm(msg)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={team.id} />
        <button className="btn sm danger" type="submit" disabled={delPending} style={{ width: "100%" }}>
          {delPending ? "Đang xóa..." : "🗑 Xóa team"}
        </button>
        {delState?.error && <div className="warn-box" style={{ marginTop: 8 }}>{delState.error}</div>}
      </form>
    </div>
  );
}
