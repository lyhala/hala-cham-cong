-- Công bù nhập riêng theo nhân sự + tháng (tách khỏi sửa công)
CREATE TABLE "WorkUnitBonus" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "units" DOUBLE PRECISION NOT NULL,
    "note" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkUnitBonus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkUnitBonus_employeeId_month_idx" ON "WorkUnitBonus"("employeeId", "month");

-- CreateIndex
CREATE INDEX "WorkUnitBonus_month_idx" ON "WorkUnitBonus"("month");

-- AddForeignKey
ALTER TABLE "WorkUnitBonus" ADD CONSTRAINT "WorkUnitBonus_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkUnitBonus" ADD CONSTRAINT "WorkUnitBonus_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;