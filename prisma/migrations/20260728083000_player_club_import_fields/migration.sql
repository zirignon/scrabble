-- Ajoute les champs nécessaires à l'import CSV fédéral des joueurs : série
-- et Elo distincts par format (duplicate/classique), coefficient
-- classique, fédération d'affiliation du joueur, et le code court du club
-- (clé d'upsert indépendante du nom affiché).

ALTER TABLE "Player"
  ADD COLUMN "classificationClassic" TEXT,
  ADD COLUMN "coefficientClassic" INTEGER,
  ADD COLUMN "eloDuplicate" INTEGER,
  ADD COLUMN "eloClassic" INTEGER,
  ADD COLUMN "federation" TEXT;

CREATE UNIQUE INDEX "Player_licenseNumber_key" ON "Player"("licenseNumber");

ALTER TABLE "Club" ADD COLUMN "code" TEXT;

CREATE UNIQUE INDEX "Club_code_key" ON "Club"("code");
