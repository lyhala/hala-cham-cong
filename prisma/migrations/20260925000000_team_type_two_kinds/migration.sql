-- Team chỉ còn 2 loại: Team sản xuất / Team hỗ trợ. Team loại cũ "OTHER" (HCNS) chuyển sang Team hỗ trợ.
UPDATE "Team" SET "type" = 'SUPPORT' WHERE "type" = 'OTHER';

-- AlterEnum
CREATE TYPE "TeamType_new" AS ENUM ('PRODUCTION', 'SUPPORT');
ALTER TABLE "Team" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Team" ALTER COLUMN "type" TYPE "TeamType_new" USING ("type"::text::"TeamType_new");
ALTER TYPE "TeamType" RENAME TO "TeamType_old";
ALTER TYPE "TeamType_new" RENAME TO "TeamType";
DROP TYPE "TeamType_old";
