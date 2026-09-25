import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { currentMonthVN, isValidMonth, monthLabel, shiftMonth } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { sortByEmployeeCode } from "@/lib/employee-order";
import { fmtMoney } from "@/lib/format";
import { needsSend } from "@/lib/payroll-db";
import { serviceAccountEmail } from "@/lib/google-sheets";
import { getSetting } from "@/lib/settings-db";
import { ActionButton } from "../employees/_components/ActionButton";
import { SheetUrlForm } from "./_components/SheetUrlForm";
import { calculatePayroll, exportPayrollSheet, sendPayroll, syncPayrollSheet, toggleLeavePayout } from "./actions";
import { annualLeaveBalances } from "@/lib/requests-db";

export default async function Page(props: PageProps<"/admin/payroll">) {
  await requireRole("ADMIN");
  const sp = await props.searchParams;
  const thisMonth = currentMonthVN();
  const month = isValidMonth(sp.month) ? sp.month : thisMonth;

  const payslips = sortByEmployeeCode(
    await prisma.payslip.findMany({ where: { month }, include: { employee: { select: { id: true, code: true, name: true, status: true, leftAt: true } } } }),
    (p) => p.employee.code,
  );
  const pending = payslips.filter((p) => needsSend(p)).length;
  const totalNet = payslips.reduce((s, p) => s + p.netPay, 0);
  const withCost = payslips.filter((p) => p.totalCost != null);
  const totalCost = withCost.reduce((s, p) => s + (p.totalCost ?? 0), 0);
  // Phép tồn hiện có của từng người (đã trừ phần quy đổi ở các tháng khác) — để Admin tick quy đổi giữa năm
  const year = Number(month.slice(0, 4));
  const leaveOf = payslips.length ? await annualLeaveBalances(payslips.map((p) => p.employeeId), year, Number(month.slice(5)), { excludePayoutMonth: month }) : new Map();
  const isDecember = month.endsWith("-12");
  const { payrollSheetUrl } = await getSetting("googleSheets");
  const accountEmail = serviceAccountEmail();

  const nav = (m: string) => `/admin/payroll?month=${m}`;

  return (
    <>
      <h1>Bảng lương</h1>
      <div className="subtitle">Tính lương theo dữ liệu chấm công, gửi phiếu cho nhân sự</div>

      <div className="month-nav" style={{ maxWidth: 320 }}>
        <Link className="btn sm" href={nav(shiftMonth(month, -1))}>‹</Link>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{monthLabel(month)}</div>
        <Link className="btn sm" href={nav(shiftMonth(month, 1))}>›</Link>
      </div>

      {month >= thisMonth && (
        <div className="info-box">
          {month === thisMonth ? "Tháng này chưa kết thúc: công mới tính đến hôm nay, lương sẽ tăng dần." : "Tháng này chưa tới."} Nên tính lương sau khi hết tháng và đã sửa xong công.
        </div>
      )}
      <div className="info-box">
        Lương lấy <b>OT, nghỉ phép, nghỉ không lương, WFH, tạm ứng</b> từ các đơn ĐÃ DUYỆT. Sau khi duyệt / xóa đơn, bấm “Tính lại” để cập nhật lương. Hệ số performance = 0 với người chưa có điểm.
      </div>

      <div className="toolbar">
        <ActionButton action={calculatePayroll} fields={{ month }} label={payslips.length ? "Tính lại cả tháng" : "Tính lương tháng này"} className="btn primary" />
        <ActionButton
          action={sendPayroll}
          fields={{ month }}
          label={`Gửi phiếu chưa gửi${pending ? ` (${pending})` : ""}`}
          className="btn"
          confirm={`Gửi ${pending} phiếu lương tháng ${month} cho nhân sự?`}
        />
        <span style={{ color: "var(--text-2)", fontSize: 12.5 }}>
          {payslips.length} phiếu · Tổng thực nhận <b>{fmtMoney(totalNet)}đ</b>
          {withCost.length > 0 && <> · Tổng chi phí ({withCost.length}/{payslips.length} người) <b>{fmtMoney(totalCost)}đ</b></>}
        </span>
      </div>

      {/* Google Sheet: xuất → HR điền BHXH/Thuế → sync ngược để có Tổng chi phí (spec §14.1) */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="section-title" style={{ marginTop: 0 }}>Google Sheet — BHXH, Thuế, Tổng chi phí</div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.6 }}>
          1) Bấm <b>Xuất ra Sheet</b> → tab <b>{month}</b> trong file cố định. 2) HR điền tay 3 cột <b>BHXH (NLĐ trả)</b>, <b>BHXH (công ty trả)</b>, <b>Thuế</b> trên Sheet.
          3) Bấm <b>Sync Tổng chi phí</b> để hệ thống đọc lại và tính. Các cột này <b>không hiện</b> trên phiếu lương gửi nhân sự.
        </div>
        <SheetUrlForm current={payrollSheetUrl} />
        {!accountEmail && (
          <div className="warn-box" style={{ marginTop: 10, marginBottom: 0 }}>
            Chưa cấu hình <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> nên chưa xuất/sync được. Xem hướng dẫn trong .env.example.
          </div>
        )}
        {accountEmail && (
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>
            Cần chia sẻ file Sheet cho <b>{accountEmail}</b> với quyền Editor.
          </div>
        )}
        <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
          <ActionButton action={exportPayrollSheet} fields={{ month }} label="Xuất ra Sheet" className="btn" />
          <ActionButton action={syncPayrollSheet} fields={{ month }} label="Sync Tổng chi phí" className="btn" />
          {payrollSheetUrl && <a className="link" href={payrollSheetUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>Mở file Sheet</a>}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nhân sự</th>
              <th className="right">Lương base</th>
              <th className="right">Lương perf</th>
              <th className="right">Hệ số perf</th>
              <th className="right">Nghỉ phép</th>
              <th className="right">Nghỉ KL</th>
              <th className="right">Công thực</th>
              <th className="right">OT (giờ)</th>
              <th className="right">Tổng công</th>
              <th className="right">Lương theo công</th>
              <th className="right">Perf thực</th>
              <th className="right">Hỗ trợ cơm</th>
              <th className="right">Gửi xe</th>
              <th className="right">Phạt muộn</th>
              <th className="right">Tạm ứng</th>
              <th className="right">Công bù</th>
              <th className="right">Quy đổi phép</th>
              <th className="right">Thực nhận</th>
              <th className="right">BHXH (NLĐ)</th>
              <th className="right">BHXH (cty)</th>
              <th className="right">Thuế</th>
              <th className="right">Tổng chi phí</th>
              <th>Trạng thái</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {payslips.map((p) => {
              const stale = needsSend(p);
              const status = !p.sentAt ? <span className="badge warn xs">Chưa gửi</span> : stale ? <span className="badge warn xs">Đã tính lại, chưa gửi lại</span> : <span className="badge ok xs">Đã gửi</span>;
              return (
                <tr key={p.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link className="link" href={`/admin/attendance?month=${month}&employee=${p.employeeId}`}>{p.employee.name}</Link>{" "}
                    <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>{p.employee.code}</span>
                    {p.employee.status === "RESIGNED" && <span className="badge neutral xs" style={{ marginLeft: 6 }}>Đã nghỉ</span>}
                  </td>
                  <td className="right">{fmtMoney(p.baseSalary)}</td>
                  <td className="right">{fmtMoney(p.perfSalary)}</td>
                  <td className="right">{p.perfCoefficient}</td>
                  <td className="right">{p.annualLeaveUsed || "—"}</td>
                  <td className="right">{p.unpaidLeaveDays || "—"}</td>
                  <td className="right">{p.actualWorkUnits} / {p.standardWorkDays}</td>
                  <td className="right">{p.otHours || "—"}</td>
                  <td className="right">{p.totalUnits}</td>
                  <td className="right">{fmtMoney(p.salaryByUnits)}</td>
                  <td className="right">{fmtMoney(p.perfActual)}</td>
                  <td className="right">{fmtMoney(p.mealAllowance)}</td>
                  <td className="right">{p.parkingAllowance ? fmtMoney(p.parkingAllowance) : "—"}</td>
                  <td className="right">{p.latePenalty ? fmtMoney(p.latePenalty) : "—"}</td>
                  <td className="right">{p.advanceDeduction ? fmtMoney(p.advanceDeduction) : "—"}</td>
                  <td className="right">{p.bonusUnits || "—"}</td>
                  <td className="right" title={p.leaveDaysPaidOut ? `${p.leaveDaysPaidOut} ngày phép tồn` : undefined}>{p.leavePayout ? fmtMoney(p.leavePayout) : "—"}</td>
                  <td className="right"><b>{fmtMoney(p.netPay)}</b></td>
                  <td className="right">{p.bhxhEmployee != null ? fmtMoney(p.bhxhEmployee) : "—"}</td>
                  <td className="right">{p.bhxhCompany != null ? fmtMoney(p.bhxhCompany) : "—"}</td>
                  <td className="right">{p.tax != null ? fmtMoney(p.tax) : "—"}</td>
                  <td className="right">{p.totalCost != null ? <b>{fmtMoney(p.totalCost)}</b> : <span className="missing">Chưa có</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{status}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <ActionButton action={calculatePayroll} fields={{ month, employeeId: p.employeeId }} label="Tính lại" showResult={false} />
                      {/* Quy đổi phép tồn giữa năm: tick cho từng người. Tháng 12 và tháng nghỉ việc tự quy đổi nên không cần tick */}
                      {!isDecember && !(p.employee.leftAt && p.employee.leftAt.toISOString().slice(0, 7) === month) && (p.payoutLeave || (leaveOf.get(p.employeeId)?.toPayOut ?? 0) > 0) && (
                        <ActionButton
                          action={toggleLeavePayout}
                          fields={{ month, employeeId: p.employeeId, on: p.payoutLeave ? "0" : "1" }}
                          label={p.payoutLeave ? "Bỏ quy đổi phép" : `Quy đổi phép (${leaveOf.get(p.employeeId)?.toPayOut} ngày)`}
                          title={p.payoutLeave ? "Bỏ quy đổi phép tồn của tháng này" : `Quy đổi ${leaveOf.get(p.employeeId)?.toPayOut} ngày phép tồn ra tiền vào phiếu lương tháng này`}
                          confirm={p.payoutLeave ? undefined : `Quy đổi ${leaveOf.get(p.employeeId)?.toPayOut} ngày phép tồn của ${p.employee.name} ra tiền vào lương tháng ${month}? Số phép này sẽ được coi là đã dùng.`}
                          showResult={false}
                        />
                      )}
                      {stale && (
                        <ActionButton action={sendPayroll} fields={{ month, employeeId: p.employeeId }} label={p.sentAt ? "Gửi lại" : "Gửi"} showResult={false} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {payslips.length === 0 && (
              <tr>
                <td colSpan={24} className="empty">Chưa có phiếu lương tháng này. Bấm “Tính lương tháng này”. Nhân sự cần có mức lương trong hồ sơ.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
