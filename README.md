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
   - `DATABASE_URL` : la chaîne de connexion "pooled" (avec `-pooler` dans le
     nom d'hôte chez Neon) — utilisée par l'application à l'exécution.
   - `DIRECT_URL` : la chaîne de connexion **directe**, sans pooler (même
     hôte sans le `-pooler` chez Neon) — nécessaire à `prisma migrate
     deploy`, qui a besoin d'un verrou de session que PgBouncer/le pooler ne
     supporte pas (erreur `P1002` sinon).
   - `SESSION_SECRET` : une valeur aléatoire longue (ex. `openssl rand -base64 32`).
   - `RESEND_API_KEY` : clé API [Resend](https://resend.com), **obligatoire**
     — toute connexion d'un compte `ADMIN`/`ORGANIZER`/`REFEREE` envoie un
     code à usage unique par email (deuxième facteur) avant d'ouvrir la
     session ; sans cette clé, l'envoi échoue systématiquement et **aucun
     membre du staff ne peut se connecter** (la réinitialisation de mot de
     passe en dépend aussi). Par défaut, les emails sont envoyés depuis
     `onboarding@resend.dev` (domaine de test Resend, sans vérification) —
     à remplacer par une adresse sur un domaine vérifié dans
     `src/lib/email.ts` (`FROM_ADDRESS`) pour un envoi fiable à des
     destinataires autres que le titulaire du compte Resend.
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
- Gestion des clubs (nom, ville, fédération, code court optionnel utilisé
  par l'import CSV — modifiable en ligne dans la liste `/admin/clubs`,
  utile pour renommer les clubs créés automatiquement sous leur code brut
  lors d'un import) et des joueurs (licence unique, catégorie, série et
  Elo duplicate, série/Elo/coefficient classique, nationalité,
  fédération d'affiliation, club)
- Import CSV de la base fédérale des joueurs (`/admin/joueurs`) : fichier
  sans en-tête, séparé par `;` (Nom;Prénoms;Licence;Elo duplicate;Série
  duplicate;Club;Catégorie;Nationalité;Fédération;Elo classique;Série
  classique;Coefficient classique), encodage ISO-8859-1, découpé en blocs
  côté navigateur pour rester sous la limite de taille de requête d'une
  fonction serverless. Upsert par n° de licence (clé unique) : les
  joueurs déjà présents sont mis à jour plutôt que dupliqués ; les clubs
  inconnus sont créés à la volée à partir de leur code (nom à corriger
  ensuite par l'organisateur si besoin) — si un club du même nom existe
  déjà sans code associé (créé manuellement, ou par un import précédent
  ou concurrent), il est réutilisé et complété avec ce code au lieu de
  faire échouer l'import des joueurs de ce club. Un déclenchement en
  double de l'import (double sélection du fichier) est bloqué côté
  navigateur pour éviter ce genre de collision. La liste des joueurs et le
  sélecteur d'inscription à un tournoi (recherche par nom ou licence)
  restent utilisables même avec des dizaines de milliers de fiches. Le
  formulaire d'ajout d'un joueur propose aussi une autocomplétion sur le
  nom : sélectionner une suggestion pré-remplit toute la fiche depuis la
  base existante et transforme l'enregistrement en mise à jour de ce
  joueur plutôt qu'en création d'un doublon
- Création de tournois (classique ou duplicate), statut de cycle de vie
  (brouillon → inscriptions ouvertes → fermées → en cours → terminé →
  archivé), et suppression définitive (avec confirmation) qui efface en
  cascade tout ce qui en dépend : inscriptions, rondes/matchs, équipes,
  poules, parties/coups en duplicate
- Inscriptions gérées par l'organisateur, ou auto-inscription pour un joueur
  connecté quand les inscriptions sont ouvertes
- Pages publiques : liste des tournois, fiche tournoi (aperçu et
  inscription), chacune des rubriques suivantes ayant sa propre page :
  classement (`/tournois/[slug]/classement`), participants
  (`/tournois/[slug]/participants` — tableau numéro/licence/nom et
  prénoms/club/fédé, exportable en CSV/PDF), rondes & résultats en
  classique (`/tournois/[slug]/rondes`) ou parties & scores en duplicate
  (`/tournois/[slug]/parties`)

### Scrabble classique
- Génération automatique des rondes en round-robin (méthode du cercle,
  avec gestion des exempts/bye si nombre impair)
- Génération round par round en système suisse (appariement par score,
  évite les revanches quand possible)
- Round-robin et suisse : phase finale à élimination directe optionnelle
  (activable/désactivable par l'organisateur depuis la page des rondes,
  avec le nombre de qualifiés configurable — au classement général, tous
  confondus, contrairement aux poules qui qualifient par poule). Se
  génère une fois la phase principale terminée, individuel comme équipes
- Poules : chaque poule joue son propre round-robin interne, avec un
  classement calculé séparément par poule ; le nombre de qualifiés par
  poule est configurable par l'organisateur, et une phase finale à
  élimination directe peut être générée automatiquement une fois les
  poules terminées, à partir des qualifiés de chaque poule (classés par
  rang puis interclassés entre poules)
- Élimination directe : génération du tableau initial (avec exempts si
  l'effectif n'est pas une puissance de 2), puis génération du tour
  suivant à partir des vainqueurs jusqu'à la finale
- Les rondes à élimination directe (tableau initial, phase finale des
  poules, phase finale round-robin/suisse) affichent le nom du tour
  selon le nombre d'entrants — Finale (2), Demi-finales (4), Quarts de
  finale (8), Huitièmes de finale (16), etc. — à la place du numéro de
  ronde, pour ne pas confondre les deux notions : le numéro de ronde
  reste utilisé pour les rondes de la phase principale (round-robin,
  suisse, poules), qui n'ont pas ce nom de tour. Sur les pages admin et
  publiques ainsi que sur l'affichage grand écran
- Ajout manuel de rondes/matchs pour composer un format sur mesure
- Chronomètre d'échecs par match (temps propre à chaque camp, alterné
  manuellement par l'arbitre, avec pause/réinitialisation)
- Saisie des scores, gestion des forfaits/annulations
- Classement calculé automatiquement : points de match, puis
  départages Buchholz, Buchholz médian, Sonneborn-Berger et score
  cumulé progressif, puis différence de score et total de points ; en
  cas d'égalité parfaite sur tous ces critères, la confrontation
  directe entre les deux joueurs tranche. La page de classement
  (publique, comme les exports CSV/PDF) affiche aussi l'âge, le club,
  la fédération et la classification de chaque joueur, dans le format
  des feuilles de classement officielles

### Scrabble duplicate
- Formule et rythme du tournoi (FISF/FFSc), deux réglages indépendants
  modifiables à tout moment depuis la page des parties :
  - la **formule** détermine les règles de jeu et les primes de
    Scrabble — Partie normale, Partie joker, Partie 7 sur 8 (avec ou
    sans joker), Partie 7 et 8 (avec ou sans joker, prime de 75 pts à
    8 lettres posées contre 50 pour 7 dans les autres formules). Dans
    les variantes « joker », les deux jokers (préalablement extraits du
    sac) et leur remplacement éventuel par la lettre représentée sont
    gérés par le juge-arbitre à la table, le logiciel ne simulant pas
    le sac de lettres — rien ne change côté saisie (un joker reste une
    lettre saisie en minuscule, toujours à 0 point) ni côté calcul du
    score ;
  - le **rythme** détermine la durée par défaut du chronomètre des
    nouvelles parties — Normal (3 min), Semi-normal (2 min 30),
    Semi-rapide (2 min), Semi-blitz (1 min 30), Blitz (1 min). Le
    chronomètre passe visuellement en alerte (couleur, sur la page
    d'arbitrage comme sur l'affichage grand écran, où une sonnerie se
    déclenche aussi) à 30 secondes de la fin pour les rythmes
    Normal/Semi-normal/Semi-rapide, 20 secondes pour Semi-blitz/Blitz,
    comme le prévoit le règlement (annonce "trente (ou vingt)
    secondes" avant la fin du temps de jeu). Seul le rythme Blitz
    bénéficie par ailleurs d'un quota d'avertissements gratuits élargi
    (5 au lieu de 3, cf. plus bas)

  Le duplicate par paires s'obtient en cochant « Tournoi par équipes »
  avec des équipes de 2 joueurs
- Création de parties
- Saisie des scores par joueur et par partie (mode simple), avec pénalités
- Saisie détaillée coup par coup : une feuille de partie (une ligne par
  tour de la grille de référence, une colonne par joueur) permet de
  saisir le score de chaque joueur à chaque tour, chaque ligne se
  validant indépendamment — le score de la partie est alors recalculé
  automatiquement à partir des coups. Les joueurs y sont affichés sous
  une étiquette anonymisée (« Joueur 1 », « Joueur 2 »...) basée sur le
  classement général cumulé avant cette partie — le 1er du classement
  devient « Joueur 1 », le 2e « Joueur 2 », etc. — pour que l'arbitre
  ne puisse pas favoriser un joueur qu'il reconnaîtrait ; les vrais
  noms restent affichés partout ailleurs (fiche de classement,
  classement public...)
- Correcteur du mot annoncé par un joueur : dans la feuille de partie, un
  champ « Mot » (en plus du score saisi à la main) permet de taper le
  mot qu'un joueur affirme avoir joué, puis de le vérifier d'un clic —
  pas besoin de connaître sa référence à l'avance. Le logiciel renvoie
  tous les placements valides de ce mot sur la grille telle qu'elle
  était avant ce tour, avec le tirage annoncé pour ce tour-là (même
  principe que le bouton « Solutions » du coup de référence, mais
  restreint à un seul mot) : une liste de références avec leur score,
  dans laquelle l'arbitre choisit le bon placement. Si la liste est
  vide, le mot est soit absent du dictionnaire importé, soit injouable
  avec ce tirage sur cette grille (le logiciel précise lequel). Le
  score du placement choisi est calculé avec exactement le même calcul
  que le coup de référence (bonus de lettre/mot, prime de Scrabble
  selon la formule), revérifié à l'enregistrement. L'arbitre peut
  toujours se rabattre sur la saisie manuelle du score (champ laissé
  vide) si le mot du joueur n'est pas à enregistrer
- Pénalités d'arbitrage sur un coup, en saisie coup par coup, conformes
  au règlement FISF du duplicate (janvier 2023) : avertissement (aucun
  effet chiffré direct pour les premiers de la partie — 5 gratuits en
  rythme Blitz uniquement, 3 dans tous les autres rythmes, §5.9 — puis
  chaque avertissement supplémentaire coûte 5 points), pénalité (-5
  points immédiats — sauf sur un coup de
  4 points ou moins, où elle est obligatoirement remplacée par un
  zéro pour ne jamais aboutir à un score négatif, §5.6) ou zéro (les
  points du coup sont ramenés à 0). La pénalité totale de la partie
  (colonne « Pénalité » de la fiche joueur) est recalculée
  automatiquement à partir de ces marques, comme le score. Un badge
  visible apparaît sur le coup concerné dès qu'une marque est
  appliquée (A, P ou Z), avec le total net après -5 affiché juste en
  dessous quand la pénalité ou l'avertissement (au-delà du quota
  gratuit) réduit les points de ce coup précis. Pour corriger une
  marque saisie par erreur, il suffit de changer la valeur du
  sélecteur sur le coup concerné et de valider à nouveau la ligne : le
  badge, le net affiché et le quota d'avertissements gratuits des
  autres coups du joueur se recalculent automatiquement. Un score de
  joueur ne peut jamais dépasser le top du coup de référence (le
  meilleur score possible pour le tirage de ce tour) : la saisie le
  bloque immédiatement dans le navigateur, et le serveur refuse
  également toute tentative de contournement
- Bonification solo (règlement §3.5) : le joueur seul à avoir le
  meilleur score sur un coup donné (comparaison sur le score brut,
  avant pénalité) reçoit un badge « Solo » sur ce coup. À partir de 16
  joueurs inscrits au tournoi, la bonification de 10 points s'ajoute
  automatiquement au score de la partie ; en dessous de ce seuil, le
  solo est signalé mais ne rapporte aucun point, comme prévu par le
  règlement
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
  petit dans le coin de la case, comme sur un jeton physique ; une
  lettre blanche (joker) affiche la lettre qu'elle représente mais sans
  coefficient, pour la repérer facilement sur la grille. La page
  d'arbitrage est organisée en deux colonnes : à gauche la grille, le
  tirage en cours affiché sous forme de tuiles (une par lettre) et une
  ligne de statut indiquant le nombre de jetons encore disponibles
  (sac + reliquat, consonnes/voyelles, et jokers restants en jeu pour
  les formules joker) ; à droite les contrôles du tour (tirage, chrono),
  le formulaire de saisie du coup de référence avec sa liste de
  solutions, puis l'historique complet des coups déjà saisis, toujours
  affiché sous forme de tableau (chaque ligne modifiable ou supprimable
  individuellement via « Modifier »), plutôt qu'un sélecteur ne montrant
  qu'un seul coup à la fois
- Résolution du joker (formules « joker » uniquement) : le règlement
  FISF remplace physiquement, au tirage suivant, un joker posé sur la
  grille par la lettre qu'il représentait, si elle est encore présente
  dans le sac. Dès que l'arbitre valide le tirage du tour suivant, le
  logiciel estime, pour chaque joker encore non résolu, s'il reste au
  moins un exemplaire de sa lettre d'après les tirages déjà enregistrés
  (distribution officielle des 102 jetons ODS moins les lettres déjà
  tirées et les jokers déjà résolus) — si oui, il le résout
  automatiquement (la grille affiche alors cette case normalement,
  coefficient de lettre visible, sur la page d'arbitrage comme sur
  l'affichage grand écran) ; sinon il le laisse bloqué sur la grille,
  sans action de l'arbitre. Le score déjà enregistré du coup qui a posé
  cette lettre n'est jamais recalculé — seul l'affichage change. Le
  logiciel ne simule pas le sac physique : cette estimation reste
  indicative, sans contrôle manuel pour la corriger (choix délibéré,
  la résolution étant entièrement automatique)
- Classement cumulé (rang, licence, nom, prénoms séparés, classification,
  catégorie, club, nationalité, cumul net, négatif et pourcentage cumulés
  par rapport au cumul des tops, puis une colonne par partie jouée) et une
  ligne de référence donnant le top de chaque partie — public comme dans
  les exports CSV/PDF, dans le format des feuilles de classement
  officielles
- Fiche de classement par partie : reprend le classement général tronqué
  aux parties 1 à N (N = la partie consultée), avec une colonne par
  partie jouée jusque-là (P1, P2...), le négatif et le pourcentage
  calculés sur le cumul de ces parties, et une ligne de référence
  donnant le top de chaque partie ainsi que leur cumul. La colonne Cumul
  n'apparaît qu'à partir de deux parties jouées, exportable en CSV/PDF
- Le top d'une partie (utilisé pour le négatif et le pourcentage de la
  fiche de classement, ainsi que la ligne de référence du classement
  général) est calculé automatiquement dès qu'au moins un coup de
  référence est saisi : c'est la somme des tops de chaque coup (le
  score du mot retenu par l'arbitre sur la grille), qui se cumule
  coup après coup jusqu'à la fin de la partie — plus besoin de le
  ressaisir à la main. La saisie manuelle du top ne reste utile qu'en
  mode simple (scores saisis sans détail coup par coup)
- N'importe quel mot peut être saisi librement, sans validation
  automatique — comme au jeu réel, c'est à l'adversaire de contester un
  mot en cas de doute. Un dictionnaire (page `/admin/dictionnaire`,
  ODS9 chargé automatiquement par le seed `npm run db:seed`, ou importé
  manuellement — fichier ou texte collé, découpé automatiquement en
  petits blocs côté navigateur pour rester sous la limite de taille de
  requête d'un hébergeur serverless, quelle que soit la taille du
  fichier) reste disponible
  comme référence, sans intervenir dans la saisie
- Recherche automatique de solutions pour la grille de référence : à
  partir du tirage saisi, de la grille actuelle et du dictionnaire
  importé, le bouton « Solutions » du formulaire de coup de référence
  propose, dans une liste large et toujours visible, la totalité des
  mots jouables trouvés (mot, référence, points), sans plafond, triés
  par score décroissant. Le coup de référence enregistré provient
  obligatoirement d'une solution choisie dans cette liste — aucune
  saisie libre de la référence ou du mot n'est possible, pour garantir
  que le coup officiel corresponde toujours à un placement réellement
  valide trouvé par le solveur. Seule exception : la case « Passe »
  (aucun mot jouable trouvé pour ce tirage), qui ne nécessite aucune
  sélection. Survoler (ou donner le focus clavier à) une solution de la
  liste l'affiche directement en aperçu sur la grille de référence
  elle-même (pas une grille séparée) : les lettres nouvelles qu'elle
  poserait sont mises en évidence (fond et bordure en pointillés bleus),
  pour que l'arbitre juge du placement avant de choisir — une case déjà
  occupée par un croisement n'est jamais comptée comme un aperçu, seules
  les lettres réellement nouvelles le sont. Cet aperçu est un simple état
  local au navigateur de l'arbitre : il n'est jamais enregistré ni
  diffusé sur l'affichage grand écran tant que le coup n'est pas
  réellement validé. Il reste affiché sur la solution choisie une fois la
  souris repartie, et disparaît si aucune solution n'est ni survolée ni
  choisie
- Compte à rebours unique par partie (temps de réflexion commun à tous
  les joueurs sur le même tirage), démarré automatiquement par l'arbitre
  dès la validation du tirage du tour (page de détail coup par coup, sous
  la grille de référence) : le tirage est aussitôt projeté tel quel sur
  l'affichage grand écran et le chrono démarre dans le même geste — sauf
  s'il tournait déjà (une revalidation par erreur ne fait alors pas
  perdre le temps déjà écoulé). Le bouton « Démarrer » séparé reste
  disponible, désactivé tant qu'aucun tirage n'est validé, surtout utile
  pour reprendre après une pause plutôt que pour le premier démarrage.
  Le tirage validé préremplit aussi le
  champ « Tirage » du formulaire de coup de référence ; dès que celui-ci
  est enregistré, le tirage validé est effacé (le reliquat prend le
  relais sur l'affichage) jusqu'à la validation du suivant, et le chrono
  se réinitialise automatiquement à sa durée par défaut, prêt pour le
  tour suivant. Le bouton « Rejeter le tirage » reste disponible en
  permanence, avant ou après validation : il efface le reliquat
  suggéré et/ou le tirage validé (erreur de saisie, tirage contesté...)
  tant qu'aucun coup n'a été enregistré dessus — tout disparaît
  aussitôt de l'affichage grand écran, le champ de saisie repart
  entièrement vierge (sans resuggérer le même reliquat) et le chrono
  repart de zéro, en attendant la validation d'un nouveau tirage. La
  durée du chronomètre se règle au format minutes:secondes (ex.
  « 2:30 » pour deux minutes trente), ou en simple nombre de minutes
- Fin de partie : une partie duplicate se termine lorsqu'il ne reste plus
  aucune voyelle ou plus aucune consonne disponible pour les tirages à
  venir — en comptant à la fois le sac et le reliquat actuellement en
  main. Le logiciel l'estime automatiquement à partir des tirages déjà
  enregistrés (comme pour le suivi du sac en formule joker) : une fois
  le sac épuisé, un bandeau l'indique sur la page de détail de la partie
  et aucun nouveau tirage ne peut plus être validé (champ et bouton
  désactivés, refusés aussi côté serveur). Le bouton « Terminer la
  partie » marque alors la partie comme terminée (affichée dans la
  liste des parties avec sa date), ou peut être utilisé à tout moment
  pour clôturer une partie plus tôt (abandon, arrêt anticipé...) ; la
  saisie des scores déjà joués reste possible après clôture pour
  corriger une erreur, et « Rouvrir la partie » annule la clôture si
  elle a été faite par erreur

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
  d'échiquiers gagnés (3 pts victoire, 2 pts nul, 1 pt défaite jouée, 0 pt
  si l'équipe était absente/forfait ; une égalité aux échiquiers doit
  être départagée manuellement en élimination directe), départage par
  différentiel d'échiquiers puis
  différence de points cumulés
- Duplicate : classement par équipes basé sur le pourcentage (cumul des
  scores nets des membres / cumul des tops de référence × 100) et le
  négatif cumulé (score − top), en plus du score net brut
- Classement par équipes affiché sur la page publique du tournoi, avec
  exports CSV/PDF dédiés

### Affichage grand écran

- Page publique dédiée par tournoi (`/tournois/[slug]/affichage`), sans
  menu de navigation, pensée pour être projetée en salle — fond bleu ciel
- Alterne automatiquement (toutes les 12 secondes) entre le classement
  (par poule le cas échéant) et la ronde en cours en classique, ou la
  dernière partie en duplicate. Le classement projeté affiche exactement
  les mêmes colonnes que la page de classement de l'organisateur (J, V,
  N, D, Pts, Buchholz, Buchholz médian, Sonneborn-Berger, cumul
  progressif, diff en classique ; parties, score, pénalités, net en
  duplicate, etc.). L'organisateur peut figer l'affichage sur l'une des
  deux vues (section « Affichage grand écran » de la fiche tournoi), par
  exemple pendant un temps fort, au lieu de laisser l'écran basculer
  automatiquement ; le changement est répercuté instantanément sur
  l'écran de projection
- Mise à jour en temps réel par flux SSE (Server-Sent Events) : dès
  qu'un score, une ronde ou un chrono est modifié côté admin, l'écran
  se met à jour instantanément, sans sondage périodique. La page
  publique de classement (`/tournois/[slug]/classement`) réutilise ce
  même flux comme simple signal de rafraîchissement : elle se
  recharge silencieusement dès qu'un résultat change, sans que le
  visiteur ait besoin d'actualiser la page lui-même
- Affiche les chronomètres en direct (compte à rebours de la partie en
  duplicate, chronomètre d'échecs par match en classique), avec un
  décompte fluide entre deux rafraîchissements. Le minuteur de la partie
  en cours (duplicate) passe en rouge et déclenche une sonnerie (une
  seule fois) dès qu'il descend sous 30 secondes, pour alerter la salle
  sans distraire les joueurs le reste du temps — le premier clic/appui
  sur l'écran débloque le son, comme l'exigent les navigateurs
- En duplicate, la vue « partie en cours » ne montre que l'essentiel
  pour la salle : la grille de référence (agrandie, carte en relief) et
  le chronomètre. La grille s'affiche dès le début de la partie, vide
  (cases bonus visibles) tant qu'aucun coup n'a encore été joué — la
  salle n'a pas besoin d'attendre le premier tirage ou le premier mot
  pour la voir apparaître. Le tirage du tour, saisi par l'arbitre (champ
  « Tirage » du coup de référence — une lettre blanche en main se note
  avec un point d'interrogation « ? »), apparaît automatiquement en
  colonne verticale à côté de la grille dès qu'il est renseigné — une
  lettre par jeton, avec son coefficient, comme sur la grille (le « ? »
  n'affiche aucun coefficient). Dès que le mot joué est renseigné, seul
  le reliquat (les lettres du tirage non posées sur la grille) est
  affiché, réorganisé en ordre alphabétique — lettres blanches en
  dernier — et suivi du signe « + » (ex. tirage AMHUQXV, mot joué VAUX
  → reliquat HMQ+), conformément à l'annonce standard en duplicate. Ce
  reliquat préremplit le champ de validation du tirage du tour suivant :
  l'arbitre n'a qu'à compléter avec les nouvelles lettres tirées (ex.
  HMQ+AEISNT), et c'est ce tirage complet, reliquat et lettres
  nouvellement tirées bien distingués par le « + », qui est projeté sur
  l'affichage grand écran une fois validé. En formule « joker », un « ? »
  est toujours ajouté au reliquat suggéré (règlement FISF : un joker
  accompagne systématiquement le tirage de chaque tour, même quand celui
  du tour précédent a été joué) — l'arbitre reste libre de le retirer à la
  main si les deux jokers sont déjà définitivement bloqués sur la grille

### Exports

- Classement (individuel et, le cas échéant, par équipes) : CSV et PDF
  (page publique du tournoi)
- Rondes/matchs (classique) et parties/scores (duplicate) : CSV
  (pages d'administration)

## Prochaines étapes possibles

- Aucune identifiée pour le moment.
