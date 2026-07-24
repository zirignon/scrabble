-- CreateEnum
CREATE TYPE "DuplicateFormula" AS ENUM ('NORMALE', 'SEMI_RAPIDE', 'BLITZ', 'JOKER', 'SEPT_SUR_HUIT', 'SEPT_ET_HUIT');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "duplicateFormula" "DuplicateFormula";
