-- DropForeignKey
ALTER TABLE "DuplicateMove" DROP CONSTRAINT "DuplicateMove_gameId_fkey";

-- DropForeignKey
ALTER TABLE "DuplicateResult" DROP CONSTRAINT "DuplicateResult_gameId_fkey";

-- DropForeignKey
ALTER TABLE "Game" DROP CONSTRAINT "Game_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_roundId_fkey";

-- DropForeignKey
ALTER TABLE "Pool" DROP CONSTRAINT "Pool_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "ReferenceMove" DROP CONSTRAINT "ReferenceMove_gameId_fkey";

-- DropForeignKey
ALTER TABLE "Registration" DROP CONSTRAINT "Registration_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "Round" DROP CONSTRAINT "Round_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_tournamentId_fkey";

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceMove" ADD CONSTRAINT "ReferenceMove_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateResult" ADD CONSTRAINT "DuplicateResult_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateMove" ADD CONSTRAINT "DuplicateMove_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
