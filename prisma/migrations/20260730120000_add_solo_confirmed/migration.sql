-- La bonification solo (+10 pts, règlement FISF §3.5) ne rapporte plus
-- automatiquement dès qu'un joueur est détecté seul meilleur score du tour :
-- l'arbitre doit désormais valider explicitement chaque solo détecté.

ALTER TABLE "DuplicateMove" ADD COLUMN "soloConfirmed" BOOLEAN NOT NULL DEFAULT false;
