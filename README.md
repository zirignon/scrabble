# Scrabble Tournois

Plateforme de gestion de tournois de Scrabble **classique** et **duplicate** :
inscriptions, rondes/appariements, saisie des résultats et classements en
direct, pour les organisateurs, arbitres, joueurs et le public.

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript, Server Actions)
- [Prisma](https://www.prisma.io) + SQLite en développement (facilement
  migrable vers PostgreSQL en changeant `provider` dans
  `prisma/schema.prisma` et `DATABASE_URL`)
- Tailwind CSS
- Authentification maison par cookie de session signé (JWT via `jose`),
  mots de passe hachés avec `bcryptjs`

## Démarrage

```bash
npm install
cp .env.example .env      # puis ajustez SESSION_SECRET
npx prisma migrate dev    # crée la base SQLite locale
npm run db:seed           # données de démonstration (voir ci-dessous)
npm run dev
```

Le site est disponible sur http://localhost:3000.

### Compte de démonstration

Après `npm run db:seed` :

- Admin : `admin@scrabble.local` / `admin1234`
- Deux tournois de démo sont créés : un tournoi **classique** en round-robin
  et un tournoi **duplicate** avec plusieurs parties.

## Fonctionnalités couvertes (MVP)

### Socle commun
- Comptes utilisateurs avec rôles (`ADMIN`, `ORGANIZER`, `REFEREE`, `PLAYER`)
- Gestion des clubs et des joueurs
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
- Ajout manuel de rondes/matchs (pour suisse, poules, élimination... en
  gérant les appariements à la main dans cette première version)
- Saisie des scores, gestion des forfaits/annulations
- Classement calculé automatiquement (points de match, différence de score)

### Scrabble duplicate
- Création de parties
- Saisie des scores par joueur et par partie (mode simple), avec pénalités
- Classement cumulé (score total, pénalités, net)

## Prochaines étapes possibles

- Système suisse et départages avancés (Buchholz, Sonneborn-Berger...)
- Saisie coup par coup en duplicate (tirages, top, arbitrage détaillé)
- Exports CSV/PDF, affichage grand écran, temps réel
- Migration vers PostgreSQL pour la production
