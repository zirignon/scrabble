CREATE TYPE "SwissSeeding" AS ENUM ('RANDOM', 'RATING');

ALTER TABLE "Tournament" ADD COLUMN "swissSeeding" "SwissSeeding" NOT NULL DEFAULT 'RANDOM';
