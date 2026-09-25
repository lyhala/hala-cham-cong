-- Số tháng thử việc riêng từng nhân sự (thay cho cờ "bỏ qua thử việc"): 0 = bỏ qua thử việc, NULL = dùng mặc định của công ty
ALTER TABLE "Employee" ADD COLUMN "probationMonths" INTEGER;
-- Giữ nguyên ý nghĩa cờ cũ
UPDATE "Employee" SET "probationMonths" = 0 WHERE "skipProbation" = true;
ALTER TABLE "Employee" DROP COLUMN "skipProbation";

-- Quy đổi phép tồn ra lương (cuối năm / tháng nghỉ việc)
ALTER TABLE "Payslip" ADD COLUMN "leaveDaysPaidOut" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "leavePayout" INTEGER NOT NULL DEFAULT 0;