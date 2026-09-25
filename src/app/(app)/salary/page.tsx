import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { fmtMoney } from "@/lib/format";
import { monthLabel } from "@/lib/dates";
import type { PayrollResult } from "@/lib/payroll";
import { getSetting } from "@/lib/settings-db";

// Nhân sự chỉ thấy bản phiếu ĐÃ GỬI (publishedData) của chính mình — không thấy phiếu đang tính dở.
export default async function Page(props: PageProps<"/salary">) {
  const user = await requireUser();
  const sp = await props.searchParams;

  const [sent, visible] = await Promise.all([
    prisma.payslip.findMany({
      where: { employeeId: user.id, status: "SENT" },
      select: { month: true, publishedData: true },
      orderBy: { month: "desc" },
    }),
    getSetting("payslipVisibleLines"),
  ]);
  const slips = sent.filter((s) => s.publishedData);
  const selected = slips.find((s) => s.month === sp.month) ?? slips[0];

  return (
    <>
      <h1>Lương</h1>
      <div className="subtitle">Phiếu lương của tôi</div>

      {!selected ? (
        <div className="card empty">Chưa có phiếu lương nào được gửi.</div>
      ) : (
        <>
          <div className="tabs">
            {slips.map((s) => (
              <Link key={s.month} className={`btn sm ${s.month === selected.month ? "primary" : ""}`} href={`/salary?month=${s.month}`}>
                {s.month.slice(5)}/{s.month.slice(0, 4)}
              </Link>
            ))}
          </div>
          <Slip month={selected.month} data={selected.publishedData as unknown as PayrollResult} visible={visible} />
        </>
      )}
    </>
  );
}

function Slip({ month, data: d, visible }: { month: string; data: PayrollResult; visible: Record<string, boolean> }) {
  const plus: [string, string, boolean][] = [
    ["Lương base", `${fmtMoney(d.baseSalary)}đ`, visible.baseSalary],
    ["Lương performance", `${fmtMoney(d.perfSalary)}đ`, visible.perfSalary],
    ["Hệ số performance", String(d.perfCoefficient), visible.perfCoefficient],
    ["Công thực", `${d.actualWorkUnits} / ${d.standardWorkDays} ngày`, visible.workUnits],
    ["OT", d.otHours ? `${d.otHours} giờ (${d.otUnits} công)` : "—", visible.ot],
  ];
  const money: [string, number, string, boolean][] = [
    ["Lương theo công", d.salaryByUnits, "+", true],
    ["Performance thực", d.perfActual, "+", true],
    ["Hỗ trợ cơm", d.mealAllowance, "+", visible.mealAllowance],
    ["Tiền gửi xe", d.parkingAllowance, "+", visible.parkingAllowance],
    ["Phạt đi muộn", d.latePenalty, "−", visible.latePenalty],
    ["Tạm ứng lương", d.advanceDeduction, "−", visible.advanceDeduction],
  ];

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="stat-label">Thực nhận tháng {monthLabel(month).replace("Tháng ", "")}</div>
      <div className="stat-value" style={{ fontSize: 26, marginBottom: 12 }}>{fmtMoney(d.netPay)}đ</div>

      <div className="section-title" style={{ marginTop: 6 }}>Thông tin tính</div>
      <table>
        <tbody>
          {plus.filter(([, , show]) => show).map(([label, value]) => (
            <tr key={label}><td>{label}</td><td className="right">{value}</td></tr>
          ))}
        </tbody>
      </table>

      <div className="section-title">Chi tiết khoản</div>
      <table>
        <tbody>
          {/* Khoản cộng luôn hiện (kể cả 0đ); khoản trừ bằng 0 thì ẩn cho gọn */}
          {money.filter(([, amount, sign, show]) => show && (sign === "+" || amount !== 0)).map(([name, amount, sign]) => (
            <tr key={name}>
              <td>{name}</td>
              <td className="right" style={{ color: sign === "−" ? "var(--danger)" : undefined }}>{sign === "−" && amount ? "−" : ""}{fmtMoney(amount)}đ</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
