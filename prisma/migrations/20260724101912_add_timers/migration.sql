-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "timerDurationSeconds" INTEGER NOT NULL DEFAULT 180,
ADD COLUMN     "timerRemainingSeconds" INTEGER,
ADD COLUMN     "timerRunning" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timerStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "awayClockRemainingSeconds" INTEGER,
ADD COLUMN     "clockInitialSeconds" INTEGER,
ADD COLUMN     "clockRunningSide" TEXT,
ADD COLUMN     "clockStartedAt" TIMESTAMP(3),
ADD COLUMN     "homeClockRemainingSeconds" INTEGER;
