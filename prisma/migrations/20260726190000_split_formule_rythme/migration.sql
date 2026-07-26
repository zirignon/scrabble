-- Sépare la "formule" (règles de jeu : Normale/Joker/7 sur 8/7 et 8, avec ou
-- sans Joker) et le "rythme" (durée du chrono : Normal/Semi-normal/
-- Semi-rapide/Semi-blitz/Blitz), auparavant mélangés dans un seul champ
-- DuplicateFormula. Les anciennes valeurs SEMI_RAPIDE et BLITZ de
-- DuplicateFormula devenaient en réalité des rythmes : elles sont migrées
-- vers le nouveau champ duplicateRythme, et duplicateFormula repasse à
-- NORMALE pour ces tournois.
--
-- Note : Postgres ne permet pas de retirer une valeur d'un type enum
-- existant sans le recréer entièrement ; SEMI_RAPIDE et BLITZ restent donc
-- des étiquettes mortes (non référencées par le schéma Prisma, jamais
-- réutilisées) dans le type "DuplicateFormula" plutôt que de risquer une
-- recréation de type sur une colonne existante.

-- AlterEnum
ALTER TYPE "DuplicateFormula" ADD VALUE 'SEPT_SUR_HUIT_JOKER';
ALTER TYPE "DuplicateFormula" ADD VALUE 'SEPT_ET_HUIT_JOKER';

-- CreateEnum
CREATE TYPE "DuplicateRythme" AS ENUM ('NORMAL', 'SEMI_NORMAL', 'SEMI_RAPIDE', 'SEMI_BLITZ', 'BLITZ');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "duplicateRythme" "DuplicateRythme";

-- Backfill : bascule les anciennes formules "vitesse" vers le rythme.
UPDATE "Tournament" SET "duplicateRythme" = 'SEMI_RAPIDE' WHERE "duplicateFormula" = 'SEMI_RAPIDE';
UPDATE "Tournament" SET "duplicateRythme" = 'BLITZ' WHERE "duplicateFormula" = 'BLITZ';
UPDATE "Tournament" SET "duplicateRythme" = 'NORMAL' WHERE "type" = 'DUPLICATE' AND "duplicateFormula" IN ('NORMALE', 'JOKER', 'SEPT_SUR_HUIT', 'SEPT_ET_HUIT');
UPDATE "Tournament" SET "duplicateFormula" = 'NORMALE' WHERE "duplicateFormula" IN ('SEMI_RAPIDE', 'BLITZ');
