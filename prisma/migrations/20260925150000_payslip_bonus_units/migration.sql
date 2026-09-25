-- Công bù do Admin nhập tay (tính vào Tổng công, chỉ nhân với lương base)
ALTER TABLE "Payslip" ADD COLUMN "bonusUnits" DOUBLE PRECISION NOT NULL DEFAULT 0;
