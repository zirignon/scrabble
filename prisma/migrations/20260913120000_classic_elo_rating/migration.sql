-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "eloAtStart" INTEGER,
ADD COLUMN     "coeffAtStart" INTEGER;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "homeEloDelta" DOUBLE PRECISION,
ADD COLUMN     "awayEloDelta" DOUBLE PRECISION;
