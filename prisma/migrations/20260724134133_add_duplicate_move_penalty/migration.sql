-- CreateEnum
CREATE TYPE "DuplicateMovePenalty" AS ENUM ('AVERTISSEMENT', 'PENALITE', 'ZERO');

-- AlterTable
ALTER TABLE "DuplicateMove" ADD COLUMN     "penaltyType" "DuplicateMovePenalty";
