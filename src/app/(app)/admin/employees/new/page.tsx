import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { suggestNextEmployeeCode } from "@/lib/employees";
import { EmployeeForm } from "../_components/EmployeeForm";

export default async function NewEmployeePage(props: PageProps<"/admin/employees/new">) {
  await requireRole("ADMIN");
  const sp = await props.searchParams;
  const [teams, code] = await Promise.all([
    prisma.team.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, type: true } }),
    suggestNextEmployeeCode(),
  ]);
  const teamId = typeof sp.team === "string" && teams.some((t) => t.id === sp.team) ? sp.team : "";

  return (
    <div style={{ maxWidth: 640 }}>
      <Link href={teamId ? "/admin/employees?tab=org" : "/admin/employees"} className="backbar">← Nhân sự</Link>
      <h1>Thêm nhân sự</h1>
      <div className="subtitle">Team / Role có thể để trống và bổ sung sau (sẽ được đánh dấu đỏ &quot;Chưa chọn&quot;).</div>
      <EmployeeForm
        mode="create"
        teams={teams}
        values={{
          id: "",
          code,
          name: "",
          email: "",
          phone: "",
          address: "",
          teamId,
          role: "EMPLOYEE",
          joinedAt: "",
          isCEO: false,
          attendanceExempt: false,
          noProject: false,
          parkingOutside: false,
        }}
      />
    </div>
  );
}
