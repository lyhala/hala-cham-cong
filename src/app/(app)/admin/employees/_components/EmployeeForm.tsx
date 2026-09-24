"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import { createEmployee, updateEmployee } from "../actions";
import { TempPasswordBox } from "./TempPasswordBox";

export type EmployeeFormValues = {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  teamId: string;
  role: string;
  joinedAt: string;
  isCEO: boolean;
  attendanceExempt: boolean;
  noProject: boolean;
  parkingOutside: boolean;
};

export type TeamOption = { id: string; name: string; type: "PRODUCTION" | "SUPPORT" };

type Props = {
  mode: "create" | "edit";
  values: EmployeeFormValues;
  teams: TeamOption[];
};

export function EmployeeForm(props: Props) {
  // Đổi key để làm mới form trống sau khi thêm xong 1 người (kèm Mã NV gợi ý kế tiếp)
  const [formKey, setFormKey] = useState(0);
  const [nextCode, setNextCode] = useState<string | null>(null);
  return (
    <EmployeeFormInner
      key={formKey}
      {...props}
      values={nextCode ? { ...props.values, code: nextCode } : props.values}
      onAddAnother={(code) => {
        setNextCode(code);
        setFormKey((k) => k + 1);
      }}
    />
  );
}

function EmployeeFormInner({ mode, values, teams, onAddAnother }: Props & { onAddAnother: (nextCode: string) => void }) {
  const [state, dispatch, pending] = useActionState(mode === "create" ? createEmployee : updateEmployee, undefined);
  const lastData = useRef<FormData | null>(null);

  // Gửi form thủ công để React không xóa các ô đã nhập khi có lỗi
  function submit(fd: FormData) {
    lastData.current = fd;
    startTransition(() => dispatch(fd));
  }

  if (mode === "create" && state?.ok && state.tempPassword) {
    return (
      <div className="card">
        <div className="ok-box">{state.message}</div>
        <TempPasswordBox password={state.tempPassword} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn primary" href={`/admin/employees/${state.employeeId}`}>Mở hồ sơ</Link>
          <button type="button" className="btn" onClick={() => onAddAnother(state.nextCode ?? "")}>+ Thêm người khác</button>
          <Link className="btn" href="/admin/employees">Về danh sách</Link>
        </div>
      </div>
    );
  }

  const roleMissing = !values.role;
  const teamMissing = !values.teamId;

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
    >
      {mode === "edit" && <input type="hidden" name="id" value={values.id} />}

      {state?.error && <div className="warn-box">{state.error}</div>}
      {state?.ok && state.message && <div className="ok-box">{state.message}</div>}
      {state?.confirmLeader && (
        <div className="warn-box" style={{ color: "var(--text)" }}>
          Team <b>{state.confirmLeader.teamName}</b> đang có Leader là <b>{state.confirmLeader.currentLeaderName}</b>.
          Thay bằng người này? {state.confirmLeader.currentLeaderName} sẽ chuyển về Nhân viên.
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className="btn sm primary"
              disabled={pending}
              onClick={() => {
                const fd = lastData.current;
                if (!fd) return;
                fd.set("confirmReplaceLeader", "1");
                submit(fd);
              }}
            >
              Thay Leader
            </button>
            <span style={{ fontSize: 12, color: "var(--text-2)", alignSelf: "center" }}>
              hoặc đổi Role / Team rồi lưu lại
            </span>
          </div>
        </div>
      )}

      <div className="grid2">
        <div className="field">
          <label htmlFor="code">Mã NV</label>
          <input id="code" name="code" defaultValue={values.code} required style={{ textTransform: "uppercase" }} />
        </div>
        <div className="field">
          <label htmlFor="name">Họ tên</label>
          <input id="name" name="name" defaultValue={values.name} required />
        </div>
      </div>

      <div className="grid2">
        <div className={`field ${teamMissing ? "field-error" : ""}`}>
          <label htmlFor="teamId">Team</label>
          <select id="teamId" name="teamId" defaultValue={values.teamId}>
            <option value="">— Chưa chọn —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className={`field ${roleMissing ? "field-error" : ""}`}>
          <label htmlFor="role">Role (Leader = Leader của team đã chọn)</label>
          <select id="role" name="role" defaultValue={values.role}>
            <option value="">— Chưa chọn —</option>
            <option value="EMPLOYEE">Nhân viên</option>
            <option value="LEADER">Leader</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
      </div>

      <div className="section-title">Thông tin liên hệ</div>
      <div className="field">
        <label htmlFor="email">Email (dùng để đăng nhập)</label>
        <input id="email" name="email" type="email" defaultValue={values.email} autoComplete="off" />
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="phone">Số điện thoại</label>
          <input id="phone" name="phone" type="tel" defaultValue={values.phone} />
        </div>
        <div className="field">
          <label htmlFor="joinedAt">Ngày vào làm</label>
          <input id="joinedAt" name="joinedAt" type="date" defaultValue={values.joinedAt} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="address">Địa chỉ</label>
        <input id="address" name="address" defaultValue={values.address} />
      </div>

      <div className="section-title">Cài đặt</div>
      <label className="check-row">
        <input type="checkbox" name="isCEO" defaultChecked={values.isCEO} />
        <span>CEO<small>Hiển thị đầu sơ đồ tổ chức. Chỉ 1 người; chọn người mới sẽ bỏ CEO của người cũ.</small></span>
      </label>
      <label className="check-row">
        <input type="checkbox" name="attendanceExempt" defaultChecked={values.attendanceExempt} />
        <span>Miễn chấm công<small>Tự tính đủ công mọi ngày, bỏ qua dữ liệu camera Hanet.</small></span>
      </label>
      <label className="check-row">
        <input type="checkbox" name="noProject" defaultChecked={values.noProject} />
        <span>Không tham gia dự án<small>Tổng chi phí của người này tự cộng vào Chi phí cố định.</small></span>
      </label>
      <label className="check-row">
        <input type="checkbox" name="parkingOutside" defaultChecked={values.parkingOutside} />
        <span>Gửi xe ngoài<small>Được hỗ trợ tiền gửi xe theo ngày công.</small></span>
      </label>

      <button className="btn primary block" type="submit" disabled={pending} style={{ marginTop: 12 }}>
        {pending ? "Đang lưu..." : mode === "create" ? "Thêm nhân sự" : "Lưu thay đổi"}
      </button>
      {mode === "create" && (
        <p style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 8 }}>
          Sau khi thêm, hệ thống sinh mật khẩu tạm ngẫu nhiên để bạn gửi cho nhân sự.
        </p>
      )}
    </form>
  );
}
