-- Admin tick quy đổi phép tồn ở 1 tháng bất kỳ trong năm
ALTER TABLE "Payslip" ADD COLUMN "payoutLeave" BOOLEAN NOT NULL DEFAULT false;
