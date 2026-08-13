-- Phase finale à élimination directe optionnelle pour les formats
-- round-robin et suisse (en plus de celle déjà existante pour les poules).

ALTER TABLE "Tournament"
  ADD COLUMN "finalPhaseEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "finalPhaseQualifiers" INTEGER NOT NULL DEFAULT 4;

ALTER TABLE "Round" ADD COLUMN "isFinalPhase" BOOLEAN NOT NULL DEFAULT false;
