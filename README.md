# Scrabble Tournois

Plateforme de gestion de tournois de Scrabble **classique** et **duplicate** :
inscriptions, rondes/appariements, saisie des résultats et classements en
direct, pour les organisateurs, arbitres, joueurs et le public.

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript, Server Actions)
- [Prisma](https://www.prisma.io) + PostgreSQL
- Tailwind CSS — palette encre/navy/or (`globals.css`), Fraunces pour les
  titres et Work Sans pour le reste (`next/font/google`)
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

## Déploiement (Vercel + PostgreSQL managé)

1. **Base de données** : créez une base PostgreSQL managée (Neon, Supabase,
   ou équivalent) et récupérez sa chaîne de connexion (avec `?sslmode=require`
   si le fournisseur l'exige).
2. **Projet Vercel** : importez le dépôt GitHub dans Vercel. Le script
   `vercel-build` (`prisma migrate deploy && next build`) est détecté
   automatiquement et applique les migrations à chaque déploiement ;
   `postinstall` (`prisma generate`) régénère le client Prisma après
   `npm install`.
3. **Variables d'environnement** (Project Settings → Environment Variables) :
   - `DATABASE_URL` : la chaîne de connexion de l'étape 1.
   - `SESSION_SECRET` : une valeur aléatoire longue (ex. `openssl rand -base64 32`).
4. **Compte administrateur** : n'utilisez **pas** `npm run db:seed` en
   production (il crée le compte de démo `admin@scrabble.local` /
   `admin1234`, dont les identifiants sont publics dans ce README). Créez
   plutôt un compte admin dédié, en local avec `DATABASE_URL` pointé sur la
   base de production, ou via le terminal Vercel :

   ```bash
   npm run db:create-admin -- admin@votre-club.fr "un-mot-de-passe-solide" "Nom Prénom"
   ```

5. Déployez — l'URL fournie par Vercel est votre site public.

## Fonctionnalités couvertes (MVP)

### Socle commun
- Comptes utilisateurs avec rôles (`ADMIN`, `ORGANIZER`, `REFEREE`, `PLAYER`).
  L'inscription publique (`/register`) ne crée que des comptes joueurs ; les
  comptes organisateur/arbitre/admin sont créés par un administrateur depuis
  la page `/admin/utilisateurs` (nom, email, mot de passe, rôle), qui permet
  aussi de changer le rôle ou réinitialiser le mot de passe d'un compte
  existant
- Gestion des clubs (nom, ville, fédération) et des joueurs (licence,
  catégorie, club)
- Création de tournois (classique ou duplicate), statut de cycle de vie
  (brouillon → inscriptions ouvertes → fermées → en cours → terminé →
  archivé), et suppression définitive (avec confirmation) qui efface en
  cascade tout ce qui en dépend : inscriptions, rondes/matchs, équipes,
  poules, parties/coups en duplicate
- Inscriptions gérées par l'organisateur, ou auto-inscription pour un joueur
  connecté quand les inscriptions sont ouvertes
- Pages publiques : liste des tournois, fiche tournoi (participants,
  planning, résultats), et page de classement séparée
  (`/tournois/[slug]/classement`)

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
- Chronomètre d'échecs par match (temps propre à chaque camp, alterné
  manuellement par l'arbitre, avec pause/réinitialisation)
- Saisie des scores, gestion des forfaits/annulations
- Classement calculé automatiquement : points de match, puis
  départages Buchholz, Buchholz médian, Sonneborn-Berger et score
  cumulé progressif, puis différence de score et total de points ; en
  cas d'égalité parfaite sur tous ces critères, la confrontation
  directe entre les deux joueurs tranche

### Scrabble duplicate
- Formule du tournoi (FISF/FFSc), modifiable à tout moment depuis la
  page des parties : Normale (3 min/coup), Semi-rapide (2 min), Blitz
  (1 min), Joker, 7 sur 8, 7 et 8 — détermine la durée par défaut du
  chronomètre des nouvelles parties et, pour 7 et 8, la prime de
  Scrabble à 8 lettres posées (75 pts, contre 50 pour 7 lettres dans
  les autres formules). Le duplicate par paires s'obtient en cochant
  « Tournoi par équipes » avec des équipes de 2 joueurs
- Création de parties
- Saisie des scores par joueur et par partie (mode simple), avec pénalités
- Saisie détaillée coup par coup (tirage, mot joué, points, top,
  passe) : le score de la partie est alors recalculé automatiquement
  à partir des coups
- Pénalités d'arbitrage sur un coup, en saisie coup par coup :
  avertissement (aucun effet chiffré direct pour les premiers de la
  partie — 5 gratuits en Blitz, 3 dans les autres formules — puis
  chaque avertissement supplémentaire coûte 5 points), pénalité (-5
  points immédiats) ou zéro (les points du coup sont ramenés à 0). La
  pénalité totale de la partie (colonne « Pénalité » de la fiche
  joueur) est recalculée automatiquement à partir de ces marques,
  comme le score
- Grille de référence de l'arbitre (coup officiel joué à chaque tour,
  contre lequel les propositions des joueurs sont comparées) :
  reconstruite et affichée (plateau 15×15 avec cases bonus et repères
  alphanumériques) sur la page de saisie et sur l'affichage grand
  écran. Un seul champ de référence par coup, dont le sens (horizontal
  ou vertical) est déduit de la notation elle-même — lettre puis
  chiffre pour horizontal (ex. H4), chiffre puis lettre pour vertical
  (ex. 4H), comme en notation duplicate standard. Une lettre saisie en
  minuscule est une lettre blanche (joker) : elle vaut 0 point. Le
  score de chaque coup de référence est calculé automatiquement
  (valeur des lettres, bonus de lettre/mot appliqués uniquement aux
  cases nouvellement posées, mots secondaires formés par les
  croisements, prime de Scrabble selon la formule du tournoi) — pas de
  saisie manuelle des points. Chaque lettre affiche son coefficient en
  petit dans le coin de la case, comme sur un jeton physique ; les
  lettres blanches (jokers) n'affichent aucun coefficient, pour les
  repérer facilement sur la grille
- Classement cumulé (score total, pénalités, net)
- Fiche de classement par partie (rang, nom/prénom, licence, catégorie,
  club, fédération, score, top, négatif, pourcentage, cumul au
  tournoi), exportable en CSV/PDF
- N'importe quel mot peut être saisi librement, sans validation
  automatique — comme au jeu réel, c'est à l'adversaire de contester un
  mot en cas de doute. Un dictionnaire (page `/admin/dictionnaire`,
  ODS9 chargé automatiquement par le seed `npm run db:seed`, ou importé
  manuellement — fichier ou texte collé, découpé automatiquement en
  petits blocs côté navigateur pour rester sous la limite de taille de
  requête d'un hébergeur serverless, quelle que soit la taille du
  fichier) reste disponible
  comme référence, sans intervenir dans la saisie
- Compte à rebours unique par partie (temps de réflexion commun à tous
  les joueurs sur le même tirage), démarré/mis en pause par l'arbitre

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
- Mise à jour en temps réel par flux SSE (Server-Sent Events) : dès
  qu'un score, une ronde ou un chrono est modifié côté admin, l'écran
  se met à jour instantanément, sans sondage périodique
- Affiche les chronomètres en direct (compte à rebours de la partie en
  duplicate, chronomètre d'échecs par match en classique), avec un
  décompte fluide entre deux rafraîchissements
- Projette la grille de référence de la partie en cours (duplicate),
  avec la liste des coups joués (référence, mot, points) à côté

### Exports

- Classement (individuel et, le cas échéant, par équipes) : CSV et PDF
  (page publique du tournoi)
- Rondes/matchs (classique) et parties/scores (duplicate) : CSV
  (pages d'administration)

## Prochaines étapes possibles

- Aucune identifiée pour le moment.
