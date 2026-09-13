-- Tournament.allowRematchesFromRound était jusqu'ici interprété, pour un
-- tournoi COMBINED, comme un numéro de ronde relatif à la phase suisse
-- (1, 2, 3...), alors que le format SWISS classique l'a toujours interprété
-- comme le numéro de ronde global du tournoi. Le code applicatif est
-- désormais cohérent avec le format SWISS dans les deux cas (numéro global,
-- affiché à l'écran, poules incluses pour un tournoi COMBINED).
--
-- Pour ne pas casser les programmations déjà faites, on convertit ici la
-- valeur déjà enregistrée pour chaque tournoi COMBINED en lui ajoutant le
-- nombre de rondes de poules déjà générées (celles-ci sont figées avant le
-- démarrage de la phase suisse), de sorte que la revanche continue à se
-- déclencher exactement à la même ronde qu'avant ce changement.
UPDATE "Tournament" t
SET "allowRematchesFromRound" = t."allowRematchesFromRound" + (
  SELECT COUNT(*)::int FROM "Round" r
  WHERE r."tournamentId" = t.id AND r."isFinalPhase" = false
)
WHERE t."format" = 'COMBINED' AND t."allowRematchesFromRound" IS NOT NULL;
