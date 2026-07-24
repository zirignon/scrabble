-- CreateTable
CREATE TABLE "DuplicateMove" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "rack" TEXT,
    "word" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "top" INTEGER,
    "isPass" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DuplicateMove_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DuplicateMove_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateMove_gameId_playerId_turnNumber_key" ON "DuplicateMove"("gameId", "playerId", "turnNumber");
