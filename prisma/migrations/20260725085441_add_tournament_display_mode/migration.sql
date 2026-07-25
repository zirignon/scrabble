-- CreateEnum
CREATE TYPE "TournamentDisplayMode" AS ENUM ('AUTO', 'STANDINGS', 'CURRENT');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "displayMode" "TournamentDisplayMode" NOT NULL DEFAULT 'AUTO';
