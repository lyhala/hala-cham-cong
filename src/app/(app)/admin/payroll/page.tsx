import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { currentMonthVN, isValidMonth, monthLabel, shiftMonth } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { fmtMoney } from "@/lib/format";
import { needsSend } from "@/lib/payroll-db";
import { ActionButton } from "../employees/_components/ActionButton";
import { calculatePayroll, sendPayroll } from "./actions";

export default async function Page(props: PageProps<"/admin/payroll">) {
  await requireRole("ADMIN");
  const sp = await props.searchParams;
  const thisMonth = currentMonthVN();
  const month = isValidMonth(sp.month) ? sp.month : thisMonth;

  const payslips = await prisma.payslip.findMany({
    where: { month },
    include: { employee: { select: { id: true, code: true, name: true, status: true } } },
    orderBy: { employee: { code: "asc" } },
  });
  const pending = payslips.filter((p) => needsSend(p)).length;
  const totalNet = payslips.reduce((s, p) => s + p.netPay, 0);

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
        Đơn từ chưa nối vào lương: <b>OT, nghỉ phép, nghỉ không lương, tạm ứng</b> đang tính bằng 0. Hệ số performance = 0 với người chưa có điểm.
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
        </span>
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
              <th className="right">Thực nhận</th>
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
                  <td className="right"><b>{fmtMoney(p.netPay)}</b></td>
                  <td style={{ whiteSpace: "nowrap" }}>{status}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <ActionButton action={calculatePayroll} fields={{ month, employeeId: p.employeeId }} label="Tính lại" showResult={false} />
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
                <td colSpan={18} className="empty">Chưa có phiếu lương tháng này. Bấm “Tính lương tháng này”. Nhân sự cần có mức lương trong hồ sơ.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
