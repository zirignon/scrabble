-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "knockoutTwoLegs" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Round" ADD COLUMN "knockoutLeg" INTEGER;
ALTER TABLE "Round" ADD COLUMN "knockoutStage" INTEGER;
