-- AlterTable
ALTER TABLE "Tournament" ALTER COLUMN "qualifiersPerPool" DROP NOT NULL;
ALTER TABLE "Tournament" ALTER COLUMN "qualifiersPerPool" DROP DEFAULT;
