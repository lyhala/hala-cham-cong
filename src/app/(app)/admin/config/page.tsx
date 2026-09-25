import Link from "next/link";
import { scheduleForDay, scheduleTimes } from "@/lib/attendance-rules";
import { requireRole } from "@/lib/auth/session";
import { PAYSLIP_LINE_LABEL, REQUEST_TYPES, RETENTION_LABEL, SHEET_LABEL, WEEKDAY_LABEL } from "@/lib/config-validate";
import { currentMonthVN, shiftMonth, todayVN } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { fmtMoney } from "@/lib/format";
import { serviceAccountEmail } from "@/lib/google-sheets";
import { TYPE_LABEL } from "@/lib/requests";
import { getSetting } from "@/lib/settings-db";
import { ActionButton } from "../employees/_components/ActionButton";
import {
  addCalendarDay, createPerfTabAction, recalcAttendanceMonth, removeCalendarDay, saveApprovalLevels, saveCriteria, saveLatePenalty, saveLeavePolicy,
  savePayslipLines, saveRetention, saveRolePermissions, saveSalaryParams, saveSheetLinks, saveWorkSchedule, syncPerfAction,
} from "./actions";
import { ConfigForm, MonthActions } from "./_components/ConfigForm";
import { Check, Field, Section } from "./_components/ui";

const TABS = [
  { key: "work", label: "Giờ làm việc & lịch" },
  { key: "late", label: "Phạt đi muộn" },
  { key: "salary", label: "Lương & phép năm" },
  { key: "approval", label: "Duyệt đơn & quyền" },
  { key: "perf", label: "Performance" },
  { key: "system", label: "Google Sheet & lưu trữ" },
] as const;

export default async function Page(props: PageProps<"/admin/config">) {
  await requireRole("ADMIN");
  const sp = await props.searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "work";

  return (
    <>
      <h1>Cấu hình</h1>
      <div className="subtitle">Mọi thay đổi đều được ghi nhật ký</div>
      <div className="tabs">
        {TABS.map((t) => (
          <Link key={t.key} className={`btn sm ${t.key === tab ? "primary" : ""}`} href={`/admin/config?tab=${t.key}`}>{t.label}</Link>
        ))}
      </div>
      {tab === "work" && <WorkTab year={Number(typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? sp.year : todayVN().slice(0, 4))} />}
      {tab === "late" && <LateTab />}
      {tab === "salary" && <SalaryTab />}
      {tab === "approval" && <ApprovalTab />}
      {tab === "perf" && <PerfTab />}
      {tab === "system" && <SystemTab />}
    </>
  );
}

// ───────────────────────── Giờ làm việc & lịch ─────────────────────────

async function WorkTab({ year }: { year: number }) {
  const schedule = await getSetting("workSchedule");
  const t = scheduleTimes(schedule);
  const hours = (min: number) => Math.round((min / 60) * 100) / 100;
  const days = await prisma.workCalendarDay.findMany({
    where: { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    orderBy: { date: "asc" },
  });
  const thisMonth = currentMonthVN();
  // Gộp các ngày ngoại lệ LIÊN TIẾP, cùng loại và cùng ghi chú thành 1 dải (kỳ nghỉ lễ nhiều ngày hiện 1 dòng)
  const groups: { from: string; to: string; count: number; isHoliday: boolean; isWorkday: boolean; note: string | null }[] = [];
  for (const row of days) {
    const day = row.date.toISOString().slice(0, 10);
    const last = groups[groups.length - 1];
    const nextOfLast = last ? new Date(new Date(`${last.to}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10) : "";
    if (last && nextOfLast === day && last.isHoliday === row.isHoliday && last.isWorkday === row.isWorkday && last.note === row.note) {
      last.to = day;
      last.count++;
    } else groups.push({ from: day, to: day, count: 1, isHoliday: row.isHoliday, isWorkday: row.isWorkday, note: row.note });
  }
  const fmtDay = (iso: string) => iso.split("-").reverse().join("/");

  return (
    <>
      <Section
        title="Giờ làm việc chuẩn (giờ mặc định của ngày thường)"
        hint={<>Công = giờ làm thực tế ÷ giờ của 1 ngày công chuẩn; giờ nghỉ trưa chỉ trừ khi thực sự nằm trong khoảng nghỉ. Hiện tại: <b>{hours(t.dayMin)} giờ/ngày</b> ({hours(t.morningMin)}h sáng + {hours(t.afternoonMin)}h chiều), nghỉ trưa <b>{hours(t.as - t.me)} giờ</b>. Đổi khung giờ thì các con số này tự đổi theo.</>}
      >
        <ConfigForm action={saveWorkSchedule}>
          <div className="grid2">
            <Field label="Vào ca sáng" name="morningStart" type="time" defaultValue={schedule.morningStart} />
            <Field label="Hết ca sáng" name="morningEnd" type="time" defaultValue={schedule.morningEnd} />
            <Field label="Vào ca chiều" name="afternoonStart" type="time" defaultValue={schedule.afternoonStart} />
            <Field label="Hết ca chiều" name="afternoonEnd" type="time" defaultValue={schedule.afternoonEnd} />
          </div>
          <div className="stat-label" style={{ marginTop: 6 }}>Ngày làm việc trong tuần & giờ làm riêng từng thứ</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8, lineHeight: 1.6 }}>
            Tick thứ có làm việc. Mỗi thứ có thể có giờ riêng — VD <b>thứ 7 chỉ làm sáng</b>: đặt buổi chiều <b>12:00 – 12:00</b> (giờ vào = giờ ra nghĩa là không làm buổi đó). Buổi nào không làm cũng đặt như vậy.
            “Số công” là công tính khi đi làm đủ giờ của ngày đó; để trống thì tự tính theo tỷ lệ giờ so với ngày thường (làm sáng 3,5h/7,5h ≈ 0,5 công).
          </div>
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table>
              <thead>
                <tr><th>Thứ</th><th>Làm việc</th><th>Sáng từ</th><th>Sáng đến</th><th>Chiều từ</th><th>Chiều đến</th><th>Số công</th><th>Hiện tại</th></tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
                  const custom = schedule.daySchedules?.[String(wd)];
                  const sample = scheduleForDay(schedule, `2026-09-${20 + wd}`); // 20/09/2026 là Chủ nhật → 20 + thứ = đúng thứ đó
                  const on = schedule.workWeekdays.includes(wd);
                  return (
                    <tr key={wd}>
                      <td style={{ whiteSpace: "nowrap" }}>{WEEKDAY_LABEL[wd]}</td>
                      <td><input type="checkbox" name={`work_${wd}`} defaultChecked={on} aria-label={`${WEEKDAY_LABEL[wd]} làm việc`} /></td>
                      {/* Buổi không làm hiện 12:00 – 12:00 (giờ vào = giờ ra) */}
                      <td><input type="time" name={`ms_${wd}`} defaultValue={custom ? (custom.morningStart ?? "12:00") : schedule.morningStart} /></td>
                      <td><input type="time" name={`me_${wd}`} defaultValue={custom ? (custom.morningEnd ?? "12:00") : schedule.morningEnd} /></td>
                      <td><input type="time" name={`as_${wd}`} defaultValue={custom ? (custom.afternoonStart ?? "12:00") : schedule.afternoonStart} /></td>
                      <td><input type="time" name={`ae_${wd}`} defaultValue={custom ? (custom.afternoonEnd ?? "12:00") : schedule.afternoonEnd} /></td>
                      <td><input name={`unit_${wd}`} inputMode="decimal" defaultValue={custom?.unit ?? ""} placeholder="tự tính" style={{ width: 70 }} /></td>
                      <td style={{ fontSize: 11.5, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                        {on ? `${hours(sample.dayMin)}h · ${sample.unit} công${sample.custom ? " (giờ riêng)" : ""}` : "nghỉ"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ConfigForm>
      </Section>

      <Section title="Tính lại công theo cấu hình mới" hint="Đổi giờ làm hoặc bảng phạt chỉ áp dụng cho ngày tính sau đó. Bấm để tính lại toàn bộ công của 1 tháng (bỏ qua ngày Admin đã sửa tay).">
        <MonthActions initialMonth={thisMonth} actions={[{ action: recalcAttendanceMonth, label: "Tính lại công tháng", confirm: "Tính lại công của cả tháng theo cấu hình hiện tại?" }]} />
      </Section>

      <Section title={`Ngày ngoại lệ trong lịch — ${year}`} hint="Lịch mặc định là các ngày làm việc ở trên. Thêm ngày lễ (OT hệ số 3x), nghỉ bù, hoặc đi làm bù (VD thứ 7). Nghỉ lễ thường kéo dài nhiều ngày nên chọn được cả một dải ngày: điền “Từ ngày” và “Đến ngày” (để trống “Đến ngày” nếu chỉ 1 ngày). Lưu xong công của các tháng đó tự tính lại.">
        <div className="toolbar">
          <Link className="btn sm" href={`/admin/config?tab=work&year=${year - 1}`}>‹ {year - 1}</Link>
          <Link className="btn sm" href={`/admin/config?tab=work&year=${year + 1}`}>{year + 1} ›</Link>
        </div>
        <ConfigForm action={addCalendarDay} label="Thêm / cập nhật">
          <div className="grid2">
            <Field label="Từ ngày" name="dateFrom" type="date" defaultValue={`${year}-${todayVN().slice(5)}`} />
            <Field label="Đến ngày (để trống nếu chỉ 1 ngày)" name="dateTo" type="date" defaultValue="" />
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="kind">Loại ngày</label>
              <select id="kind" name="kind" defaultValue="HOLIDAY">
                <option value="HOLIDAY">Nghỉ lễ / tết (OT 3x)</option>
                <option value="OFF">Nghỉ (nghỉ bù...)</option>
                <option value="WORK">Đi làm bù (làm việc)</option>
              </select>
            </div>
            <Field label="Ghi chú" name="note" defaultValue="" hint="VD: Nghỉ Quốc khánh 2/9" />
          </div>
        </ConfigForm>
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>Ngày</th><th>Loại</th><th>Ghi chú</th><th /></tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.from}>
                  <td>
                    {fmtDay(g.from)}{g.from !== g.to && <> → {fmtDay(g.to)}</>}
                    <span style={{ color: "var(--text-3)" }}> {WEEKDAY_LABEL[new Date(`${g.from}T00:00:00Z`).getUTCDay()]}{g.from !== g.to && ` → ${WEEKDAY_LABEL[new Date(`${g.to}T00:00:00Z`).getUTCDay()]}`}</span>
                    {g.count > 1 && <span className="badge neutral xs" style={{ marginLeft: 6 }}>{g.count} ngày</span>}
                  </td>
                  <td>{g.isHoliday ? <span className="badge danger xs">Nghỉ lễ</span> : g.isWorkday ? <span className="badge ok xs">Đi làm bù</span> : <span className="badge neutral xs">Nghỉ</span>}</td>
                  <td>{g.note ?? "—"}</td>
                  <td className="right"><ActionButton action={removeCalendarDay} fields={{ dateFrom: g.from, dateTo: g.to }} label={g.count > 1 ? "Bỏ cả dải" : "Bỏ"} confirm={`Bỏ ${g.count > 1 ? `${g.count} ngày ngoại lệ ${fmtDay(g.from)} → ${fmtDay(g.to)}` : `ngày ngoại lệ ${fmtDay(g.from)}`}?`} /></td>
                </tr>
              ))}
              {groups.length === 0 && <tr><td colSpan={4} className="empty">Chưa có ngày ngoại lệ nào trong năm {year}.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>    </>
  );
}

// ───────────────────────── Phạt đi muộn ─────────────────────────

async function LateTab() {
  const cfg = await getSetting("latePenalty");
  const { morningStart } = await getSetting("workSchedule");
  const rows = Array.from({ length: 8 }, (_, i) => cfg.tiers[i] ?? null);
  return (
    <Section title="Bảng phạt đi muộn lũy tiến" hint={<>Mỗi phút muộn tính theo mức của khung chứa phút đó (không lấy mức khung cuối cho cả buổi). Mốc vào ca hiện là <b>{morningStart}</b>. Dòng để trống sẽ bỏ qua; tối đa 8 khung.</>}>
      <ConfigForm action={saveLatePenalty}>
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table>
            <thead><tr><th>Từ giờ</th><th>Đến giờ</th><th>Mức phạt (đ/phút)</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><input name={`tierFrom${i}`} type="time" defaultValue={r?.from ?? ""} /></td>
                  <td><input name={`tierTo${i}`} type="time" defaultValue={r?.to ?? ""} /></td>
                  <td><input name={`tierRate${i}`} inputMode="numeric" defaultValue={r ? fmtMoney(r.perMinute) : ""} style={{ width: 120 }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid2">
          <Field label="Đến sau giờ này thì trừ ½ công (không phạt tiền)" name="halfDayAfter" type="time" defaultValue={cfg.halfDayAfter} />
          <Field label="Số lần được miễn phạt mỗi tháng (cần đơn được duyệt)" name="freeExemptionsPerMonth" type="number" defaultValue={cfg.freeExemptionsPerMonth} />
        </div>
      </ConfigForm>
    </Section>
  );
}

// ───────────────────────── Lương & phép năm ─────────────────────────

async function SalaryTab() {
  const [p, leave] = await Promise.all([getSetting("salaryParams"), getSetting("leavePolicy")]);
  return (
    <>
      <Section title="Tham số lương">
        <ConfigForm action={saveSalaryParams}>
          <div className="grid2">
            <Field label="Hỗ trợ cơm (đ/tháng, chia theo ngày công)" name="mealAllowancePerMonth" defaultValue={fmtMoney(p.mealAllowancePerMonth)} />
            <Field label="Tiền gửi xe (đ/ngày công, người gửi xe ngoài)" name="parkingPerDay" defaultValue={fmtMoney(p.parkingPerDay)} />
          </div>
          <div className="grid3">
            <Field label="Hệ số OT ngày thường" name="otWeekday" defaultValue={p.otCoefficients.weekday} />
            <Field label="Hệ số OT cuối tuần" name="otWeekend" defaultValue={p.otCoefficients.weekend} />
            <Field label="Hệ số OT lễ tết" name="otHoliday" defaultValue={p.otCoefficients.holiday} />
          </div>
        </ConfigForm>
      </Section>
      <Section title="Phép năm" hint="Nhân sự chính thức (sau thử việc) được cộng phép mỗi tháng, không dùng thì cộng dồn sang tháng sau, không được nghỉ ứng trước. Phép tồn cuối năm được quy đổi ra lương (tính vào phiếu lương tháng 12) nên mỗi năm tích lũy lại từ đầu. Tháng vào làm là tháng thứ 1 của thử việc: thử việc 2 tháng thì từ tháng thứ 3 mới tính phép. Số tháng thử việc mặc định ở đây; từng nhân sự có thể đặt riêng trong hồ sơ (điền 0 = bỏ qua thử việc).">
        <ConfigForm action={saveLeavePolicy}>
          <div className="grid2">
            <Field label="Số ngày phép được cộng mỗi tháng" name="daysPerMonth" type="number" defaultValue={leave.daysPerMonth} />
            <Field label="Số tháng thử việc mặc định (chưa tính phép)" name="probationMonths" type="number" defaultValue={leave.probationMonths} />
            <Field label="Ngày chốt của tháng đầu (vào làm từ ngày này trở về trước = đủ 1 tháng)" name="firstMonthCutoffDay" type="number" defaultValue={leave.firstMonthCutoffDay} />
            <Field label="Phép của tháng đầu nếu vào làm SAU ngày chốt (ngày)" name="firstMonthPartialDays" type="number" defaultValue={leave.firstMonthPartialDays} />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>
            Ví dụ: chốt ngày {leave.firstMonthCutoffDay}, vào làm ngày {leave.firstMonthCutoffDay} trở về trước thì tháng đầu tích lũy được phép đủ {leave.daysPerMonth} ngày; vào sau ngày {leave.firstMonthCutoffDay} thì tháng đầu chỉ {leave.firstMonthPartialDays} ngày. Từ tháng tiếp theo tính {leave.daysPerMonth} ngày/tháng bình thường. “Tháng đầu” là tháng đầu tiên được tính phép (sau thử việc).
          </div>
        </ConfigForm>
      </Section>
    </>
  );
}

// ───────────────────────── Duyệt đơn & quyền ─────────────────────────

async function ApprovalTab() {
  const [levels, perms, lines] = await Promise.all([getSetting("approvalLevels"), getSetting("rolePermissions"), getSetting("payslipVisibleLines")]);
  return (
    <>
      <Section title="Cách duyệt từng loại đơn" hint="1 cấp: Leader HOẶC Admin duyệt là xong (ai duyệt trước tính người đó). 2 cấp: Leader duyệt trước, Admin duyệt sau mới có hiệu lực (Admin cũng được duyệt thẳng). Nên dùng 2 cấp cho loại đơn ảnh hưởng tiền như OT và Tạm ứng.">
        <ConfigForm action={saveApprovalLevels}>
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table>
              <tbody>
                {REQUEST_TYPES.map((t) => (
                  <tr key={t}>
                    <td>{TYPE_LABEL[t]}</td>
                    <td>
                      <select name={`level_${t}`} defaultValue={String(levels[t])}>
                        <option value="1">1 cấp (Leader hoặc Admin)</option>
                        <option value="2">2 cấp (Leader rồi Admin)</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ConfigForm>
      </Section>

      <Section title="Quyền và nút chức năng theo role">
        <ConfigForm action={saveRolePermissions}>
          <div className="stat-label">Leader</div>
          <Check name="leader_approve" label="Được duyệt đơn của team mình" defaultChecked={perms.leader.approve} />
          <small style={{ display: "block", color: "var(--text-3)", fontSize: 11.5, marginBottom: 6 }}>Leader không sửa được chấm công và không xem lương (chỉ Admin; Leader xem số liệu tổng hợp trên file Google Sheet).</small>
          <div className="stat-label" style={{ marginTop: 10 }}>Nhân viên</div>
          <Check name="employee_wfh" label="Hiện nút xin WFH" defaultChecked={perms.employee.wfh} />
          <Check name="employee_advance" label="Hiện nút xin tạm ứng lương" defaultChecked={perms.employee.advance} />
        </ConfigForm>
      </Section>

      <Section title="Dòng hiện trên phiếu lương nhân sự" hint="“Thực nhận” luôn hiện. BHXH, Thuế và Tổng chi phí nội bộ không bao giờ hiện cho nhân sự.">
        <ConfigForm action={savePayslipLines}>
          {(Object.keys(PAYSLIP_LINE_LABEL) as (keyof typeof PAYSLIP_LINE_LABEL)[]).map((k) => (
            <Check key={k} name={`line_${k}`} label={PAYSLIP_LINE_LABEL[k]} defaultChecked={lines[k]} />
          ))}
        </ConfigForm>
      </Section>
    </>
  );
}

// ───────────────────────── Performance ─────────────────────────

async function PerfTab() {
  const [criteria, sheets] = await Promise.all([
    prisma.performanceCriterion.findMany({ orderBy: [{ group: "asc" }, { sortOrder: "asc" }] }),
    getSetting("googleSheets"),
  ]);
  const total = criteria.reduce((s, c) => s + c.weight, 0);
  const rows = [...criteria, ...Array.from({ length: 3 }, () => null)];
  const prevMonth = shiftMonth(currentMonthVN(), -1);

  return (
    <>
      <Section title="Tiêu chí chấm performance" hint={<>Hệ số performance = Σ(điểm tiêu chí 0–5 × trọng số %) ÷ 5. Tổng trọng số phải đúng <b>100%</b> (hiện là <b style={{ color: total === 100 ? "var(--success)" : "var(--danger)" }}>{total}%</b>). Tick “Xóa” để bỏ tiêu chí (điểm đã sync của tiêu chí đó cũng bị xóa); dòng trống ở cuối để thêm tiêu chí mới. Cột trên Google Sheet nhận diện theo <b>tên tiêu chí</b> nên đổi tên xong hãy tạo tab tháng mới.</>}>
        <ConfigForm action={saveCriteria}>
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table>
              <thead><tr><th>Nhóm</th><th>Tên tiêu chí</th><th>Trọng số (%)</th><th>Xóa</th></tr></thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c?.id ?? `new${i}`}>
                    <td>
                      <input type="hidden" name={`id${i}`} value={c?.id ?? ""} />
                      <select name={`group${i}`} defaultValue={c?.group ?? "BASE"}>
                        <option value="BASE">Base performance</option>
                        <option value="OUT">Out performance</option>
                      </select>
                    </td>
                    <td><input name={`name${i}`} defaultValue={c?.name ?? ""} placeholder={c ? "" : "Tiêu chí mới"} style={{ width: "100%", minWidth: 220 }} /></td>
                    <td><input name={`weight${i}`} type="number" min={0} max={100} defaultValue={c?.weight ?? ""} style={{ width: 80 }} /></td>
                    <td>{c && <input type="checkbox" name={`remove${i}`} aria-label="Xóa tiêu chí" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ConfigForm>
      </Section>

      <Section title="Chấm điểm trên Google Sheet" hint={<>Dùng <b>1 file Google Sheet riêng</b> (không chung với Bảng lương) để dễ tổng hợp — link ở tab “Google Sheet & lưu trữ”. Mỗi tháng 1 tab <b>YYYY-MM</b>, nhân sự xếp theo Mã NV (ADM → NV001 → NV002...). 1) Bấm <b>Tạo tab tháng</b> → có sẵn danh sách nhân sự và cột từng tiêu chí. 2) Leader điền điểm 0–5. 3) Bấm <b>Sync ngay</b> → hệ thống lưu điểm (ô để trống = xóa điểm cũ). Tab đã có thì không bị ghi đè. Điểm chưa có thì hệ số performance = 0.</>}>
        {!sheets.performanceSheetUrl && <div className="warn-box">Chưa nhập link file Google Sheet Performance — vào tab “Google Sheet & lưu trữ”.</div>}
        {!serviceAccountEmail() && <div className="warn-box">Chưa cấu hình GOOGLE_SERVICE_ACCOUNT_JSON.</div>}
        <MonthActions initialMonth={prevMonth} actions={[{ action: createPerfTabAction, label: "Tạo tab tháng" }, { action: syncPerfAction, label: "Sync ngay", primary: true }]} />
        {sheets.performanceSheetUrl && <a className="link" href={sheets.performanceSheetUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>Mở file Sheet</a>}
      </Section>
    </>
  );
}

// ───────────────────────── Google Sheet & lưu trữ ─────────────────────────

async function SystemTab() {
  const [sheets, retention] = await Promise.all([getSetting("googleSheets"), getSetting("retention")]);
  const email = serviceAccountEmail();
  return (
    <>
      <Section title="File Google Sheet của từng luồng" hint={<>Mỗi luồng dùng đúng <b>1 file cố định</b>; mỗi tháng chỉ thêm tab mới, không tạo file mới. Chia sẻ file cho {email ? <b>{email}</b> : "tài khoản dịch vụ Google (chưa cấu hình GOOGLE_SERVICE_ACCOUNT_JSON)"} với quyền Editor.</>}>
        <ConfigForm action={saveSheetLinks}>
          {(Object.keys(SHEET_LABEL) as (keyof typeof SHEET_LABEL)[]).map((k) => (
            <Field key={k} label={SHEET_LABEL[k]} name={k} defaultValue={sheets[k]} hint={k === "performanceSheetUrl" || k === "payrollSheetUrl" ? undefined : "Luồng này chưa có trong hệ thống"} />
          ))}
        </ConfigForm>
      </Section>
      <Section title="Lưu trữ dữ liệu" hint="Job hằng ngày (npm run retention) xóa dữ liệu quá hạn khỏi database. Tính theo tháng dương lịch, giữ cả tháng hiện tại.">
        <ConfigForm action={saveRetention}>
          <div className="grid2">
            {(Object.keys(RETENTION_LABEL) as (keyof typeof RETENTION_LABEL)[]).map((k) => (
              <Field key={k} label={`${RETENTION_LABEL[k]} — số tháng`} name={k} type="number" defaultValue={retention[k]} />
            ))}
          </div>
        </ConfigForm>
      </Section>
    </>
  );
}
