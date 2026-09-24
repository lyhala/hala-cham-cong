-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'LEADER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TeamType" AS ENUM ('PRODUCTION', 'SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'RESIGNED');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('OT', 'LATE', 'EARLY_LEAVE', 'LEAVE', 'WFH', 'SALARY_ADVANCE');

-- CreateEnum
CREATE TYPE "LeaveSubtype" AS ENUM ('ANNUAL', 'UNPAID', 'MARRIAGE', 'FUNERAL');

-- CreateEnum
CREATE TYPE "DayPortion" AS ENUM ('FULL', 'MORNING', 'AFTERNOON');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'LEADER_APPROVED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'SENT');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PerformanceGroup" AS ENUM ('BASE', 'OUT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REQUEST_PENDING', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'PAYSLIP_SENT', 'BONUS_RECEIVED', 'OTHER');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TeamType" NOT NULL DEFAULT 'OTHER',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "leaderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "teamId" TEXT,
    "role" "Role",
    "isCEO" BOOLEAN NOT NULL DEFAULT false,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" DATE,
    "leftAt" DATE,
    "attendanceExempt" BOOLEAN NOT NULL DEFAULT false,
    "noProject" BOOLEAN NOT NULL DEFAULT false,
    "parkingOutside" BOOLEAN NOT NULL DEFAULT false,
    "hanetPersonId" TEXT,
    "faceImageUrl" TEXT,
    "passwordHash" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryHistory" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "baseSalary" INTEGER NOT NULL,
    "perfSalary" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkCalendarDay" (
    "date" DATE NOT NULL,
    "isWorkday" BOOLEAN NOT NULL,
    "isHoliday" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkCalendarDay_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "AttendanceLog" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "hanetPersonId" TEXT NOT NULL,
    "deviceId" TEXT,
    "time" TIMESTAMP(3) NOT NULL,
    "imageUrl" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyAttendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "workUnits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "latePenalty" INTEGER NOT NULL DEFAULT 0,
    "halfDayDeducted" BOOLEAN NOT NULL DEFAULT false,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "RequestType" NOT NULL,
    "leaveSubtype" "LeaveSubtype",
    "dateFrom" DATE,
    "dateTo" DATE,
    "dayPortion" "DayPortion",
    "timeFrom" TEXT,
    "timeTo" TEXT,
    "amount" INTEGER,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "leaderApprovedById" TEXT,
    "leaderApprovedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "standardWorkDays" DOUBLE PRECISION NOT NULL,
    "baseSalary" INTEGER NOT NULL,
    "perfSalary" INTEGER NOT NULL,
    "perfCoefficient" DOUBLE PRECISION NOT NULL,
    "annualLeaveUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unpaidLeaveDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualWorkUnits" DOUBLE PRECISION NOT NULL,
    "otHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otUnits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUnits" DOUBLE PRECISION NOT NULL,
    "salaryByUnits" INTEGER NOT NULL,
    "perfActual" INTEGER NOT NULL,
    "mealAllowance" INTEGER NOT NULL,
    "parkingAllowance" INTEGER NOT NULL,
    "latePenalty" INTEGER NOT NULL DEFAULT 0,
    "advanceDeduction" INTEGER NOT NULL DEFAULT 0,
    "netPay" INTEGER NOT NULL,
    "bhxhEmployee" INTEGER,
    "bhxhCompany" INTEGER,
    "tax" INTEGER,
    "totalCost" INTEGER,
    "status" "PayslipStatus" NOT NULL DEFAULT 'DRAFT',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceCriterion" (
    "id" TEXT NOT NULL,
    "group" "PerformanceGroup" NOT NULL,
    "name" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PerformanceCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceScore" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bonus" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "projectId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "inChargeTeamId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAllocation" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedCost" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMonthlyCost" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "outsourcing" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMonthlyCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Team_leaderId_key" ON "Team"("leaderId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_code_key" ON "Employee"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_hanetPersonId_key" ON "Employee"("hanetPersonId");

-- CreateIndex
CREATE INDEX "Session_employeeId_idx" ON "Session"("employeeId");

-- CreateIndex
CREATE INDEX "SalaryHistory_employeeId_effectiveFrom_idx" ON "SalaryHistory"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "AttendanceLog_employeeId_time_idx" ON "AttendanceLog"("employeeId", "time");

-- CreateIndex
CREATE INDEX "AttendanceLog_hanetPersonId_time_idx" ON "AttendanceLog"("hanetPersonId", "time");

-- CreateIndex
CREATE INDEX "DailyAttendance_date_idx" ON "DailyAttendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyAttendance_employeeId_date_key" ON "DailyAttendance"("employeeId", "date");

-- CreateIndex
CREATE INDEX "Request_employeeId_type_dateFrom_idx" ON "Request"("employeeId", "type", "dateFrom");

-- CreateIndex
CREATE INDEX "Request_status_idx" ON "Request"("status");

-- CreateIndex
CREATE INDEX "Payslip_month_idx" ON "Payslip"("month");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_employeeId_month_key" ON "Payslip"("employeeId", "month");

-- CreateIndex
CREATE INDEX "PerformanceScore_month_idx" ON "PerformanceScore"("month");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceScore_employeeId_criterionId_month_key" ON "PerformanceScore"("employeeId", "criterionId", "month");

-- CreateIndex
CREATE INDEX "Bonus_date_idx" ON "Bonus"("date");

-- CreateIndex
CREATE INDEX "Bonus_employeeId_idx" ON "Bonus"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "ProjectAllocation_month_projectId_idx" ON "ProjectAllocation"("month", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAllocation_month_employeeId_projectId_key" ON "ProjectAllocation"("month", "employeeId", "projectId");

-- CreateIndex
CREATE INDEX "FixedCost_month_idx" ON "FixedCost"("month");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMonthlyCost_month_projectId_key" ON "ProjectMonthlyCost"("month", "projectId");

-- CreateIndex
CREATE INDEX "Notification_employeeId_readAt_idx" ON "Notification"("employeeId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryHistory" ADD CONSTRAINT "SalaryHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryHistory" ADD CONSTRAINT "SalaryHistory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_leaderApprovedById_fkey" FOREIGN KEY ("leaderApprovedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceScore" ADD CONSTRAINT "PerformanceScore_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceScore" ADD CONSTRAINT "PerformanceScore_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "PerformanceCriterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bonus" ADD CONSTRAINT "Bonus_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bonus" ADD CONSTRAINT "Bonus_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bonus" ADD CONSTRAINT "Bonus_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_inChargeTeamId_fkey" FOREIGN KEY ("inChargeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAllocation" ADD CONSTRAINT "ProjectAllocation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAllocation" ADD CONSTRAINT "ProjectAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMonthlyCost" ADD CONSTRAINT "ProjectMonthlyCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
