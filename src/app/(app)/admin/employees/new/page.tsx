import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { suggestNextEmployeeCode } from "@/lib/employees";
import { EmployeeForm } from "../_components/EmployeeForm";

// Tạo nhân sự mới. Vào team cụ thể luôn làm ở Sơ đồ tổ chức ("+ Thêm người có sẵn"),
// không còn qua đây — trang này chỉ tạo người hoàn toàn mới.
export default async function NewEmployeePage() {
  await requireRole("ADMIN");
  const [teams, code] = await Promise.all([
    prisma.team.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, type: true } }),
    suggestNextEmployeeCode(),
  ]);

  return (
    <div style={{ maxWidth: 640 }}>
      <Link href="/admin/employees" className="backbar">← Nhân sự</Link>
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
          teamId: "",
          role: "EMPLOYEE",
          joinedAt: "",
          isCEO: false,
          attendanceExempt: false,
          noProject: false,
          parkingOutside: false,
          probationMonths: "",
        }}
      />
    </div>
  );
}
