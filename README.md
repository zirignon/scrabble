# Scrabble Tournois

Plateforme de gestion de tournois de Scrabble **classique** et **duplicate** :
inscriptions, rondes/appariements, saisie des résultats et classements en
direct, pour les organisateurs, arbitres, joueurs et le public.

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript, Server Actions)
- [Prisma](https://www.prisma.io) + PostgreSQL
- Tailwind CSS
- Authentification maison par cookie de session signé (JWT via `jose`),
  mots de passe hachés avec `bcryptjs`

## Démarrage

```bash
docker compose up -d      # lance une base PostgreSQL locale (voir docker-compose.yml)
npm install
cp .env.example .env      # puis ajustez SESSION_SECRET
npx prisma migrate dev    # crée le schéma sur la base PostgreSQL
npm run db:seed           # données de démonstration (voir ci-dessous)
npm run dev
```

Sans Docker, pointez simplement `DATABASE_URL` vers n'importe quelle
instance PostgreSQL (locale ou hébergée).

Le site est disponible sur http://localhost:3000.

### Compte de démonstration

Après `npm run db:seed` :

- Admin : `admin@scrabble.local` / `admin1234`
- Deux tournois de démo sont créés : un tournoi **classique** en round-robin
  et un tournoi **duplicate** avec plusieurs parties.

## Fonctionnalités couvertes (MVP)

### Socle commun
- Comptes utilisateurs avec rôles (`ADMIN`, `ORGANIZER`, `REFEREE`, `PLAYER`)
- Gestion des clubs (nom, ville, fédération) et des joueurs (licence,
  catégorie, club)
- Création de tournois (classique ou duplicate), statut de cycle de vie
  (brouillon → inscriptions ouvertes → fermées → en cours → terminé →
  archivé)
- Inscriptions gérées par l'organisateur, ou auto-inscription pour un joueur
  connecté quand les inscriptions sont ouvertes
- Pages publiques : liste des tournois, fiche tournoi (participants,
  planning, résultats, classement)

### Scrabble classique
- Génération automatique des rondes en round-robin (méthode du cercle,
  avec gestion des exempts/bye si nombre impair)
- Génération round par round en système suisse (appariement par score,
  évite les revanches quand possible)
- Poules : chaque poule joue son propre round-robin interne, avec un
  classement calculé séparément par poule ; le nombre de qualifiés par
  poule est configurable par l'organisateur, et une phase finale à
  élimination directe peut être générée automatiquement une fois les
  poules terminées, à partir des qualifiés de chaque poule (classés par
  rang puis interclassés entre poules)
- Élimination directe : génération du tableau initial (avec exempts si
  l'effectif n'est pas une puissance de 2), puis génération du tour
  suivant à partir des vainqueurs jusqu'à la finale
- Ajout manuel de rondes/matchs pour composer un format sur mesure
- Saisie des scores, gestion des forfaits/annulations
- Classement calculé automatiquement : points de match, différence de
  score, départages Buchholz et Sonneborn-Berger

### Scrabble duplicate
- Création de parties
- Saisie des scores par joueur et par partie (mode simple), avec pénalités
- Saisie détaillée coup par coup (tirage, mot joué, points, top,
  passe) : le score de la partie est alors recalculé automatiquement
  à partir des coups
- Classement cumulé (score total, pénalités, net)
- Fiche de classement par partie (rang, nom/prénom, licence, catégorie,
  club, fédération, score, top, négatif, pourcentage, cumul au
  tournoi), exportable en CSV/PDF

### Tournois par équipes

- Un tournoi (classique ou duplicate) peut être marqué « par équipes » à
  la création
- Gestion des équipes et de leurs membres (un échiquier fixe par joueur
  en classique)
- Classique : génération des rondes par équipes en round-robin, système
  suisse, poules (chaque poule joue son propre round-robin interne entre
  équipes, classement séparé par poule, phase finale à élimination
  directe générable à partir des équipes qualifiées) ou élimination
  directe (tableau avec exempts si l'effectif n'est pas une puissance de
  2, tour suivant généré à partir des vainqueurs des confrontations) —
  un match par échiquier, résultat de la confrontation à la majorité
  d'échiquiers gagnés (3 pts victoire, 1 pt nul, 0 pt défaite ; une
  égalité aux échiquiers doit être départagée manuellement en
  élimination directe), départage par différentiel d'échiquiers puis
  différence de points cumulés
- Duplicate : classement par équipes basé sur le pourcentage (cumul des
  scores nets des membres / cumul des tops de référence × 100) et le
  négatif cumulé (score − top), en plus du score net brut
- Classement par équipes affiché sur la page publique du tournoi, avec
  exports CSV/PDF dédiés

### Affichage grand écran

- Page publique dédiée par tournoi (`/tournois/[slug]/affichage`), sans
  menu de navigation, pensée pour être projetée en salle
- Alterne automatiquement (toutes les 12 secondes) entre le classement
  (par poule le cas échéant) et la ronde en cours en classique, ou la
  dernière partie en duplicate
- Se rafraîchit automatiquement toutes les 8 secondes pour rester à jour
  en temps réel sans intervention

### Exports

- Classement (individuel et, le cas échéant, par équipes) : CSV et PDF
  (page publique du tournoi)
- Rondes/matchs (classique) et parties/scores (duplicate) : CSV
  (pages d'administration)

## Prochaines étapes possibles

- Départages avancés supplémentaires (Buchholz médian, dégressif...)
- Saisie coup par coup avec validation du dictionnaire, timer
