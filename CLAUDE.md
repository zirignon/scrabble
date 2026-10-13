@AGENTS.md

# Scrabble Tournois : contexte du projet

Plateforme de gestion de tournois de Scrabble **classique** et **duplicate** (inscriptions, rondes, appariements, saisie des résultats, classements en direct, affichage grand écran, exports CSV/PDF). Développée par Ahissé, en lien avec la Fédération Ivoirienne de Scrabble (FIS). Interface et code métier en **français**.

## ⚠️ Stack différente des autres projets d'Ahissé

Ce dépôt n'utilise **pas** la stack des sites Ivoire Électroménagers ou inscriptions-fis.ci. Les règles des agents personnels qui parlent de HTML/JS vanilla, de GitHub Pages, de Supabase Edge Functions, de `script.js`, de `supabaseClient` ou de Paiement Pro **ne s'appliquent pas ici**.

- **Next.js 16** (App Router, TypeScript, Server Actions), **React 19**. Lire `AGENTS.md` : l'API Next.js de cette version diffère de ce que tu connais, consulte `node_modules/next/dist/docs/` avant d'écrire du code Next.
- **Prisma 6 + PostgreSQL** (`prisma/schema.prisma`, migrations dans `prisma/migrations/`).
- **Tailwind CSS 4** : palette encre/navy/or dans `src/app/globals.css`, polices Fraunces (titres) et Work Sans (texte) via `next/font/google`.
- **Authentification maison** : cookie de session signé (JWT avec `jose`), mots de passe `bcryptjs`, 2FA par code e-mail, réinitialisation de mot de passe, journal d'audit (`AuditLog`).
- **E-mails** : Resend (`src/lib/email.ts`).
- **Validation** : zod. **PDF** : pdfkit (`src/lib/pdf.ts`).
- **Déploiement** : Vercel + PostgreSQL managé. `vercel-build` lance `prisma migrate deploy && next build`.

## Organisation du code

| Dossier | Contenu |
|---|---|
| `src/app/admin/…` | Back-office (tournois, rondes, poules, équipes, parties, joueurs, clubs, utilisateurs, dictionnaire) |
| `src/app/tournois/[slug]/…` | Pages publiques (classement, participants, rondes, parties, affichage grand écran) |
| `src/app/api/…` | Routes d'export CSV/PDF et flux temps réel de l'affichage (`affichage/stream`) |
| `src/lib/actions/` | Server Actions (une par domaine : tournaments, classic, duplicate, pools, teams, players…) |
| `src/lib/classic/` | Logique classique : round-robin, suisse, appariements, élimination directe, classements |
| `src/lib/duplicate/` | Logique duplicate : grille, solveur, feuille de partie, anonymisation, classements |
| `src/lib/guards.ts` | `requireUser`, `requireRole`, `canManageTournament` |
| `src/lib/security.ts` | Règles de sécurité pures et testées |
| `tests/` | Tests `classic.test.ts` et `security.test.ts` |

Rôles (`enum Role`) : `ADMIN`, `ORGANIZER`, `REFEREE`, `PLAYER`. Les rôles staff sont `ADMIN`, `ORGANIZER`, `REFEREE`.

## Règles du projet

1. **Contrôle d'accès côté serveur** : chaque Server Action et route API qui lit ou modifie des données non publiques appelle `requireRole` / `canManageTournament`. Ne jamais se contenter de masquer un bouton dans l'interface.
2. **Règlement officiel** : la logique duplicate suit le règlement FISF (janvier 2023 : avertissements, pénalités, solo, formules et rythmes). Toute modification du calcul des scores ou des classements doit rester conforme et être couverte par des tests.
3. **Migrations Prisma** : toute modification de `schema.prisma` s'accompagne d'une migration dans `prisma/migrations/` (nom horodaté). Ne jamais modifier une migration déjà existante.
4. **Production** : ne jamais lancer `npm run db:seed` contre la base de production (il crée un compte admin de démo public). Créer l'admin avec `npm run db:create-admin`. `SESSION_SECRET` doit faire au moins 32 caractères.
5. **Dictionnaire** : `prisma/data/ods9.txt` fait plus de 400 000 lignes (4,5 Mo). Ne pas le lire en entier ; utiliser `grep` ou `head` si besoin.
6. **Import des joueurs** : CSV fédéral sans en-tête, séparateur `;`, encodage ISO-8859-1, upsert par numéro de licence (clé unique). Ne pas casser ce format.
7. Mettre à jour la section concernée du `README.md` quand une fonctionnalité change : il sert de documentation fonctionnelle.

## Vérifications avant de terminer une tâche

Ce sont les mêmes étapes que la CI (`.github/workflows/ci.yml`) :

```
npx prisma validate
npm run lint
npm run typecheck
npm test
npm run build
```

## Environnement d'Ahissé

- Windows 10, **cmd.exe** (pas PowerShell) : les commandes données à Ahissé doivent être compatibles cmd.
- En local : `docker compose up -d` pour PostgreSQL, puis `npm install`, `copy .env.example .env`, `npx prisma migrate dev`, `npm run db:seed`, `npm run dev` (http://localhost:3000).
