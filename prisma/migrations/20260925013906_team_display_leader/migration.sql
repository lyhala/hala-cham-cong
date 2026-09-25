-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "displayLeaderId" TEXT;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_displayLeaderId_fkey" FOREIGN KEY ("displayLeaderId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
