-- AlterEnum
ALTER TYPE "ClassicFormat" ADD VALUE 'COMBINED';

-- AlterTable
ALTER TABLE "Round" ADD COLUMN "isSwissPhase" BOOLEAN NOT NULL DEFAULT false;
