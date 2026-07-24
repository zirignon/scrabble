-- CreateTable
CREATE TABLE "ReferenceMove" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "word" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "isPass" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReferenceMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceMove_gameId_turnNumber_key" ON "ReferenceMove"("gameId", "turnNumber");

-- AddForeignKey
ALTER TABLE "ReferenceMove" ADD CONSTRAINT "ReferenceMove_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
