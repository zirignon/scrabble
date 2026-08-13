-- Match de classement optionnel pour la 3e place (perdants des demi-finales)
-- sur tout tableau à élimination directe (KNOCKOUT, phase finale de poules,
-- ou phase finale round-robin/suisse générée depuis le classement général).

ALTER TABLE "Tournament" ADD COLUMN "thirdPlaceMatchEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Match" ADD COLUMN "isThirdPlace" BOOLEAN NOT NULL DEFAULT false;
