-- CreateTable
CREATE TABLE "ResolvedJoker" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResolvedJoker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResolvedJoker_gameId_row_col_key" ON "ResolvedJoker"("gameId", "row", "col");

-- AddForeignKey
ALTER TABLE "ResolvedJoker" ADD CONSTRAINT "ResolvedJoker_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
