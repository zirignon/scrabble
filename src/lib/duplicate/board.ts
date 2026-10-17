export const BOARD_SIZE = 15;

export interface ReferenceMoveLike {
  turnNumber: number;
  row: number;
  col: number;
  direction: string;
  word: string | null;
  isPass: boolean;
}

// Référence alphanumérique d'une case (ligne = lettre A-O, colonne =
// numéro 1-15) : le sens du coup est encodé par l'ordre lettre/chiffre,
// comme en notation duplicate standard — ex. "H4" (lettre puis chiffre)
// pour un mot horizontal ligne H colonne 4, "4H" (chiffre puis lettre)
// pour un mot vertical même case.
export function formatReference(row: number, col: number, direction: string): string {
  const letter = String.fromCharCode(64 + row);
  return direction === "ACROSS" ? `${letter}${col}` : `${col}${letter}`;
}

export function parseReference(
  value: string
): { row: number; col: number; direction: "ACROSS" | "DOWN" } | null {
  const trimmed = value.trim().toUpperCase();

  const across = trimmed.match(/^([A-O])(\d{1,2})$/);
  if (across) {
    const row = across[1].charCodeAt(0) - 64;
    const col = Number(across[2]);
    if (row < 1 || row > 15 || col < 1 || col > 15) return null;
    return { row, col, direction: "ACROSS" };
  }

  const down = trimmed.match(/^(\d{1,2})([A-O])$/);
  if (down) {
    const col = Number(down[1]);
    const row = down[2].charCodeAt(0) - 64;
    if (row < 1 || row > 15 || col < 1 || col > 15) return null;
    return { row, col, direction: "DOWN" };
  }

  return null;
}

// Une case posée de la grille : la lettre affichée (toujours en majuscule)
// et si elle provient d'un joker/lettre blanche (saisie en minuscule dans
// le mot de référence) — une lettre blanche n'affiche pas de coefficient
// sur la grille, pour la distinguer visuellement des lettres normales.
export interface BoardCell {
  letter: string;
  isBlank: boolean;
}

// Reconstruit la grille (15x15, lignes/colonnes numérotées 1 à 15 côté
// saisie) en rejouant les coups de référence dans l'ordre des tours :
// chaque lettre du mot est posée case par case selon le sens du coup.
export function reconstructBoard(moves: ReferenceMoveLike[]): (BoardCell | null)[][] {
  const grid: (BoardCell | null)[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(null)
  );

  const sorted = [...moves].sort((a, b) => a.turnNumber - b.turnNumber);
  for (const move of sorted) {
    if (move.isPass || !move.word) continue;
    for (let i = 0; i < move.word.length; i++) {
      const row = move.direction === "DOWN" ? move.row - 1 + i : move.row - 1;
      const col = move.direction === "ACROSS" ? move.col - 1 + i : move.col - 1;
      if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) continue;
      const raw = move.word[i];
      grid[row][col] = { letter: raw.toUpperCase(), isBlank: raw !== raw.toUpperCase() };
    }
  }

  return grid;
}

export interface ResolvedJokerLike {
  row: number;
  col: number;
}

// Applique à une grille déjà reconstruite les jokers résolus (règle FISF
// des formules joker, voir le commentaire sur getBingoRules) : le joker
// physiquement remplacé par la lettre qu'il représentait s'affiche alors
// normalement (coefficient de lettre visible), comme une lettre posée
// ordinaire. Ne touche jamais au score déjà enregistré du coup de référence
// qui a posé cette case — ReferenceMove.points n'est jamais recalculé par
// une résolution de joker, voir validateGameRackAction (src/lib/actions/
// duplicate.ts), qui résout automatiquement un joker dès que son
// estimation de lettres restantes (computeRemainingLetters) le permet.
export function applyResolvedJokers(
  grid: (BoardCell | null)[][],
  resolved: ResolvedJokerLike[]
): (BoardCell | null)[][] {
  if (resolved.length === 0) return grid;
  const next = grid.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
  for (const { row, col } of resolved) {
    const cell = next[row - 1]?.[col - 1];
    if (cell) cell.isBlank = false;
  }
  return next;
}

// Formules de tournoi incluant le mécanisme du joker (voir le commentaire
// sur getBingoRules) : seules celles-ci déclenchent la résolution
// automatique d'un joker posé sur la grille (validateGameRackAction).
export function isJokerFormula(formula: string | null | undefined): boolean {
  return formula === "JOKER" || formula === "SEPT_SUR_HUIT_JOKER" || formula === "SEPT_ET_HUIT_JOKER";
}

// Même reconstruction que reconstructBoard, mais sous forme de simples
// lettres (sans le statut "lettre blanche") — le format attendu par
// computeMoveScore et par le solveur de mots.
export function buildPlainBoard(moves: ReferenceMoveLike[]): (string | null)[][] {
  return reconstructBoard(moves).map((row) => row.map((cell) => (cell ? cell.letter : null)));
}

export interface PlayedLetter {
  letter: string;
  isBlank: boolean;
}

// Lettres du tirage réellement consommées par un coup (cases nouvellement
// posées uniquement) : un croisement qui réutilise une lettre déjà présente
// sur la grille ne pioche pas de lettre supplémentaire dans le tirage.
export function getNewlyPlacedLetters<T>(
  boardBeforeMove: (T | null)[][],
  word: string,
  row: number,
  col: number,
  direction: "ACROSS" | "DOWN"
): PlayedLetter[] {
  const letters: PlayedLetter[] = [];
  for (let i = 0; i < word.length; i++) {
    const r = direction === "DOWN" ? row - 1 + i : row - 1;
    const c = direction === "ACROSS" ? col - 1 + i : col - 1;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
    if (!boardBeforeMove[r][c]) {
      const raw = word[i];
      letters.push({ letter: raw.toUpperCase(), isBlank: raw !== raw.toUpperCase() });
    }
  }
  return letters;
}

// Reliquat du tirage annoncé à un tour donné : les lettres non jouées,
// réorganisées en ordre alphabétique (lettres blanches "?" en dernier) et
// suivies du signe "+" — convention d'annonce standard en duplicate,
// signalant qu'il sera complété au tour suivant. Une lettre blanche en main
// est notée "?" dans le tirage (elle n'a pas de valeur propre tant qu'elle
// n'est pas posée) ; quand un coup pose une lettre blanche (minuscule dans
// le mot joué), c'est un "?" du tirage qui est consommé, pas la lettre
// qu'elle représente.
//
// En formule joker (voir le commentaire sur getBingoRules), le règlement
// FISF accompagne systématiquement le tirage de chaque tour d'un joker,
// tant qu'il en reste un en jeu — le "?" est donc ajouté automatiquement
// au reliquat suggéré s'il n'y est pas déjà, même quand le joker du tour
// précédent a été joué. Comme pour tout reliquat suggéré, l'arbitre reste
// libre de corriger le champ à la main (ex. si les deux jokers sont déjà
// définitivement bloqués sur la grille, cas que le logiciel ne peut pas
// détecter puisqu'il ne simule pas le sac).
//
// Lettres réellement non jouées d'un tirage (multiset brut, sans tri ni
// suggestion automatique de joker) : le "+" est un séparateur
// d'affichage/saisie (voir validateGameRackAction), pas une lettre du
// tirage — on l'ignore ici par sécurité s'il en reste un. Partagée par
// formatReliquat (reliquat affiché/suggéré à l'arbitre) et
// computeRemainingLetters (suivi du sac, voir plus bas) : les deux
// dérivent cette même notion de "ce qui n'a pas été joué ce tour-là",
// indépendamment de la façon dont l'arbitre a saisi le "+".
function remainingRackLetters(rack: string, playedLetters: PlayedLetter[]): string[] {
  const remaining = rack.replace(/\+/g, "").split("");
  for (const played of playedLetters) {
    const idx = remaining.indexOf(played.isBlank ? "?" : played.letter);
    if (idx !== -1) remaining.splice(idx, 1);
  }
  return remaining;
}

// Renvoie null si tout le tirage a été joué et qu'aucun "?" n'est à
// suggérer (rien à compléter).
export function formatReliquat(
  rack: string,
  playedLetters: PlayedLetter[],
  formula?: string | null
): string | null {
  const remaining = remainingRackLetters(rack, playedLetters);
  if (isJokerFormula(formula) && !remaining.includes("?")) {
    remaining.push("?");
  }
  if (remaining.length === 0) return null;
  const letters = remaining.filter((c) => c !== "?").sort();
  const blanks = remaining.filter((c) => c === "?");
  return `${[...letters, ...blanks].join("")}+`;
}

export interface ReliquatMoveLike extends ReferenceMoveLike {
  rack: string | null;
}

// Reliquat du dernier coup joué, à préremplir dans le champ de saisie du
// tirage du tour suivant : l'arbitre n'a alors qu'à compléter avec les
// nouvelles lettres tirées, ce qui donne à l'affichage un tirage de la
// forme "B+AEISNT" (reliquat, puis lettres nouvellement tirées) — le même
// calcul sert à la fois à l'affichage grand écran (tant qu'aucun tirage
// n'a encore été validé pour le tour suivant) et à la valeur par défaut du
// champ de saisie de l'arbitre.
export function computeLastReliquat(
  moves: ReliquatMoveLike[],
  formula?: string | null
): string | null {
  const sorted = [...moves].sort((a, b) => a.turnNumber - b.turnNumber);
  const lastMove = sorted[sorted.length - 1];
  if (!lastMove?.rack) return null;

  if (!lastMove.isPass && lastMove.word) {
    const boardBefore = reconstructBoard(sorted.filter((m) => m.turnNumber < lastMove.turnNumber));
    const playedLetters = getNewlyPlacedLetters(
      boardBefore,
      lastMove.word,
      lastMove.row,
      lastMove.col,
      lastMove.direction as "ACROSS" | "DOWN"
    );
    return formatReliquat(lastMove.rack, playedLetters, formula);
  }
  return formatReliquat(lastMove.rack, [], formula);
}

// Distribution officielle des 102 jetons du Scrabble francophone (ODS) :
// 100 lettres + 2 jokers. Sert uniquement au suivi du sac d'une partie
// joker (voir computeRemainingLetters) — les jokers eux-mêmes ne sont pas
// comptés ici, puisqu'ils sont suivis séparément (ReferenceMove/
// ResolvedJoker), pas comme des lettres ordinaires piochées.
export const FRENCH_LETTER_DISTRIBUTION: Record<string, number> = {
  A: 9, B: 2, C: 2, D: 3, E: 15, F: 2, G: 2, H: 2, I: 8, J: 1, K: 1,
  L: 5, M: 3, N: 6, O: 6, P: 2, Q: 1, R: 6, S: 6, T: 6, U: 6, V: 2,
  W: 1, X: 1, Y: 1, Z: 1,
};

// Estime, pour une partie joker donnée, combien d'exemplaires de chaque
// lettre restent dans le sac — à partir des seules données déjà
// enregistrées (ReferenceMove.rack et ResolvedJoker), sans dépendre du
// format de saisie "reliquat+nouvelles" de l'arbitre : les lettres
// nouvellement tirées à chaque tour sont déduites en comparant le tirage
// complet annoncé à ce tour-là au reliquat réellement non joué du tour
// précédent (recalculé nous-mêmes via remainingRackLetters, pas celui
// suggéré par formatReliquat qui peut inclure un "?" ajouté
// automatiquement). Un joker résolu (ResolvedJoker) consomme en plus un
// exemplaire de la lettre qu'il représente, puisque son remplacement
// physique tire une tuile supplémentaire du sac, hors tirage normal.
//
// Reste une estimation : si l'arbitre ne renseigne pas le tirage d'un
// coup (rack null, ne devrait pas arriver pour un coup validé via le
// formulaire), le suivi perd la trace du reliquat à ce point et
// recommence à zéro au coup suivant plutôt que de se tromper en
// silence. Comme le logiciel ne simule pas le sac physique, ce compteur
// reste indicatif — aucun contrôle manuel n'existe pour corriger une
// résolution automatique erronée (choix délibéré, voir le commit qui
// retire resolveJokerAction/unresolveJokerAction).
export function computeRemainingLetters(
  moves: ReliquatMoveLike[],
  resolvedJokers: ResolvedJokerLike[]
): Record<string, number> {
  const remaining: Record<string, number> = { ...FRENCH_LETTER_DISTRIBUTION };
  const sorted = [...moves].sort((a, b) => a.turnNumber - b.turnNumber);

  let previousReliquat: string[] = [];
  for (const move of sorted) {
    if (!move.rack) {
      previousReliquat = [];
      continue;
    }
    const fullRack = move.rack.replace(/\+/g, "").split("");

    // Lettres nouvellement tirées ce tour-ci = tirage complet moins le
    // reliquat (réel) du tour précédent, retiré une occurrence à la fois.
    const newlyDrawn = [...fullRack];
    for (const carried of previousReliquat) {
      const idx = newlyDrawn.indexOf(carried);
      if (idx !== -1) newlyDrawn.splice(idx, 1);
    }
    for (const letter of newlyDrawn) {
      if (letter === "?") continue;
      if (letter in remaining) remaining[letter] -= 1;
    }

    const playedLetters =
      !move.isPass && move.word
        ? getNewlyPlacedLetters(
            reconstructBoard(sorted.filter((m) => m.turnNumber < move.turnNumber)),
            move.word,
            move.row,
            move.col,
            move.direction as "ACROSS" | "DOWN"
          )
        : [];
    previousReliquat = remainingRackLetters(move.rack, playedLetters);
  }

  if (resolvedJokers.length > 0) {
    const board = reconstructBoard(moves);
    for (const { row, col } of resolvedJokers) {
      const letter = board[row - 1]?.[col - 1]?.letter;
      if (letter && letter in remaining) remaining[letter] -= 1;
    }
  }

  return remaining;
}

// Lettres considérées comme voyelles pour la règle de fin de partie
// ci-dessous (le Y francophone compte comme voyelle au Scrabble). Les
// jokers ("?") ne sont ni l'un ni l'autre et ne sont jamais comptés ici.
export const FRENCH_VOWELS = new Set(["A", "E", "I", "O", "U", "Y"]);

// Fin de partie (règlement duplicate) : la partie se termine lorsqu'il ne
// reste plus aucune voyelle ou plus aucune consonne disponible pour les
// tirages à venir — en comptant à la fois le sac (computeRemainingLetters)
// ET le reliquat actuellement en main (dernier tirage non entièrement
// joué, non formaté pour l'affichage donc sans "?" de joker suggéré) : un
// reliquat tout en consonnes, par exemple, ne permet plus de jouer tant
// que le sac n'a plus de voyelle non plus.
// Lettres encore disponibles pour les tirages à venir : le sac
// (computeRemainingLetters) complété du reliquat actuellement en main
// (dernier tirage non entièrement joué, recalculé sans suggestion
// automatique de "?" pour ne pas fausser le compte) — partagée par
// isGameOver (fin de partie) et par la ligne de statut du sac affichée à
// l'arbitre sur la page de saisie.
export function computeAvailableLetters(
  moves: ReliquatMoveLike[],
  resolvedJokers: ResolvedJokerLike[]
): Record<string, number> {
  const remaining = computeRemainingLetters(moves, resolvedJokers);
  const reliquat = (computeLastReliquat(moves) ?? "").replace(/\+$/, "");
  for (const letter of reliquat) {
    if (letter === "?") continue;
    if (letter in remaining) remaining[letter] += 1;
  }
  return remaining;
}

export function isGameOver(moves: ReliquatMoveLike[], resolvedJokers: ResolvedJokerLike[]): boolean {
  const remaining = computeAvailableLetters(moves, resolvedJokers);
  let vowels = 0;
  let consonants = 0;
  for (const [letter, count] of Object.entries(remaining)) {
    if (count <= 0) continue;
    if (FRENCH_VOWELS.has(letter)) vowels += count;
    else consonants += count;
  }
  return vowels === 0 || consonants === 0;
}

// Nombre de jokers actuellement bloqués sur la grille (posés mais jamais
// résolus, voir applyResolvedJokers). Par construction, un joker non résolu
// dont la lettre représentée est encore disponible aurait déjà été résolu à
// la validation d'un tirage suivant (voir validateGameRackAction) : tout
// joker encore non résolu ici représente donc une lettre épuisée dans le
// sac, bloqué définitivement sur la grille (règle décrite dans le
// commentaire sur getBingoRules). Sert uniquement à l'affichage (ligne de
// statut du sac) — jamais au calcul du score, qui ne dépend pas de l'état
// résolu/non résolu d'un joker.
export function countStuckJokers(
  moves: ReferenceMoveLike[],
  resolvedJokers: ResolvedJokerLike[]
): number {
  const board = reconstructBoard(moves);
  const resolvedSet = new Set(resolvedJokers.map((j) => `${j.row}-${j.col}`));
  let count = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c]?.isBlank && !resolvedSet.has(`${r + 1}-${c + 1}`)) count++;
    }
  }
  return count;
}

// Disposition standard des cases bonus du Scrabble, utilisée à la fois
// pour l'affichage et pour le calcul automatique des scores.
type BonusCell = "TW" | "DW" | "TL" | "DL" | null;

const TW: [number, number][] = [
  [0, 0], [0, 7], [0, 14],
  [7, 0], [7, 14],
  [14, 0], [14, 7], [14, 14],
];
const DW: [number, number][] = [
  [1, 1], [2, 2], [3, 3], [4, 4],
  [1, 13], [2, 12], [3, 11], [4, 10],
  [13, 1], [12, 2], [11, 3], [10, 4],
  [13, 13], [12, 12], [11, 11], [10, 10],
  [7, 7],
];
const TL: [number, number][] = [
  [1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13],
  [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9],
];
const DL: [number, number][] = [
  [0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14],
  [6, 2], [6, 6], [6, 8], [6, 12], [7, 3], [7, 11],
  [8, 2], [8, 6], [8, 8], [8, 12], [11, 0], [11, 7], [11, 14],
  [12, 6], [12, 8], [14, 3], [14, 11],
];

export function getBonusGrid(): BonusCell[][] {
  const grid: BonusCell[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(null)
  );
  for (const [r, c] of TW) grid[r][c] = "TW";
  for (const [r, c] of DW) grid[r][c] = "DW";
  for (const [r, c] of TL) grid[r][c] = "TL";
  for (const [r, c] of DL) grid[r][c] = "DL";
  return grid;
}

// Valeurs des lettres au Scrabble francophone (ODS).
export const FRENCH_LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 10,
  L: 1, M: 2, N: 1, O: 1, P: 3, Q: 8, R: 1, S: 1, T: 1, U: 1, V: 4,
  W: 10, X: 10, Y: 10, Z: 10,
};

export interface BingoRule {
  tileCount: number;
  bonus: number;
}

const DEFAULT_BINGO_RULES: BingoRule[] = [{ tileCount: 7, bonus: 50 }];

// Prime de Scrabble selon la formule du tournoi duplicate : les formules
// standards (normale, joker, 7 sur 8, 7 sur 8 joker) ne primetent que les
// tirages de 7 lettres posées (+50) ; la formule 7 et 8 (avec ou sans
// joker) ajoute une prime de 75 points pour 8 lettres posées.
//
// Règle officielle des variantes "joker" (FISF/FFSc), gérée entièrement par
// le juge-arbitre à la table, hors logiciel (qui ne simule pas le sac de
// lettres) : les deux jokers sont extraits du sac au préalable ; à chaque
// coup, l'arbitre pioche 6 lettres (au lieu de 7) systématiquement
// accompagnées d'un joker. Si la solution retenue utilise ce joker, il est
// remplacé par la lettre qu'il représentait — à condition qu'elle soit
// encore présente dans le sac — et revient dans la réserve de jokers pour
// le coup suivant ; sinon, il reste sur la grille et la partie continue
// avec le second joker, jusqu'à ce que celui-ci soit lui aussi utilisé (la
// partie redevient alors un Duplicate classique, tirages de 7 lettres).
// L'arbitre doit préférer, à score égal, une solution qui préserve le
// joker. Rien de tout cela ne change le calcul du score : une lettre jouée
// en joker (saisie en minuscule dans le mot du coup de référence, voir
// computeMoveScore plus bas) vaut toujours 0 point quelle que soit la
// formule — seul le seuil de la prime ci-dessous varie avec la formule.
export function getBingoRules(formula: string | null | undefined): BingoRule[] {
  if (formula === "SEPT_ET_HUIT" || formula === "SEPT_ET_HUIT_JOKER") {
    return [{ tileCount: 7, bonus: 50 }, { tileCount: 8, bonus: 75 }];
  }
  return DEFAULT_BINGO_RULES;
}

// Durée par défaut du chronomètre de partie selon le rythme (secondes) :
// Normal 3' (2'30+0'30), Semi-normal 2'30 (2'00+0'30), Semi-rapide 2'00
// (1'30+0'30), Semi-blitz 1'30 (1'10+0'20), Blitz 1' (0'40+0'20).
export function getRythmeTimerSeconds(rythme: string | null | undefined): number {
  switch (rythme) {
    case "SEMI_NORMAL":
      return 150;
    case "SEMI_RAPIDE":
      return 120;
    case "SEMI_BLITZ":
      return 90;
    case "BLITZ":
      return 60;
    default:
      return 180;
  }
}

// Repère d'alerte avant la fin du temps de jeu, en secondes restantes
// (règlement FISF §3.3 : l'arbitre annonce "chrono – trente (ou vingt)
// secondes – terminé") : 30 secondes pour les rythmes Normal/Semi-normal/
// Semi-rapide, 20 secondes pour Semi-blitz/Blitz.
export function getRythmeAlertSeconds(rythme: string | null | undefined): number {
  return rythme === "SEMI_BLITZ" || rythme === "BLITZ" ? 20 : 30;
}

// Nombre d'avertissements gratuits (sur une même partie) avant que chaque
// avertissement supplémentaire ne coûte 5 points : 5 dans le rythme Blitz
// uniquement (le 6e coûte 5 points), 3 dans tous les autres rythmes — le
// 4e coûte 5 points (règlement FISF §5.9).
export function getFreeAvertissementCount(rythme: string | null | undefined): number {
  return rythme === "BLITZ" ? 5 : 3;
}

export interface ReferenceMoveTopLike {
  points: number;
}

// Le top d'une partie duplicate est la somme des tops de chaque coup : en
// duplicate, le top d'un coup est le score du mot retenu par l'arbitre sur
// la grille de référence (la meilleure solution pour ce tirage), donc le
// top de la partie se cumule automatiquement coup après coup au fil des
// coups de référence saisis, jusqu'à la fin de la partie — pas besoin de le
// ressaisir à la main. Si aucun coup de référence n'a été saisi (tournoi
// utilisant uniquement la saisie simple des scores, sans détail coup par
// coup), on retombe sur la valeur entrée manuellement.
export function computeGameTop(
  referenceMoves: ReferenceMoveTopLike[],
  manualTop: number | null
): number | null {
  if (referenceMoves.length === 0) return manualTop;
  return referenceMoves.reduce((sum, m) => sum + m.points, 0);
}

export interface MoveScoreLike {
  turnNumber: number;
  playerId: string;
  points: number;
}

// Nombre de joueurs inscrits au-delà duquel (strictement) la bonification
// solo (+10 pts) s'applique (règlement FISF §3.5).
export const SOLO_BONUS_MIN_PLAYERS = 16;
export const SOLO_BONUS_POINTS = 10;

// Détermine, pour chaque tour, le joueur "solo" éventuel : celui dont le
// score sur ce coup est strictement supérieur à celui de tous les autres
// joueurs ayant un coup enregistré pour ce même tour (règlement FISF §3.5 —
// comparaison sur le score brut, avant application d'une éventuelle
// pénalité). Un tour avec moins de deux coups enregistrés, ou une égalité
// pour le meilleur score, n'a pas de solo. Renvoie une Map
// turnNumber -> playerId du joueur solo.
export function computeSoloWinners(moves: MoveScoreLike[]): Map<number, string> {
  const byTurn = new Map<number, MoveScoreLike[]>();
  for (const move of moves) {
    const list = byTurn.get(move.turnNumber) ?? [];
    list.push(move);
    byTurn.set(move.turnNumber, list);
  }

  const solos = new Map<number, string>();
  for (const [turnNumber, list] of byTurn) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => b.points - a.points);
    if (sorted[0].points > sorted[1].points) {
      solos.set(turnNumber, sorted[0].playerId);
    }
  }
  return solos;
}

export interface MovePenaltyLike {
  turnNumber: number;
  playerId: string;
  penaltyType: string | null;
}

// Pour chaque coup marqué "avertissement", indique s'il est encore dans le
// quota gratuit du joueur ou s'il coûte 5 points (au-delà) — en comptant,
// dans l'ordre des tours, les avertissements déjà posés à CE joueur dans
// la partie. Clé de la map : "turnNumber:playerId".
export function computeAvertissementCosts(
  moves: MovePenaltyLike[],
  freeCount: number
): Map<string, boolean> {
  const costsFive = new Map<string, boolean>();
  const countByPlayer = new Map<string, number>();
  const sorted = [...moves].sort((a, b) => a.turnNumber - b.turnNumber);
  for (const move of sorted) {
    if (move.penaltyType !== "AVERTISSEMENT") continue;
    const count = (countByPlayer.get(move.playerId) ?? 0) + 1;
    countByPlayer.set(move.playerId, count);
    costsFive.set(`${move.turnNumber}:${move.playerId}`, count > freeCount);
  }
  return costsFive;
}

// Repère, à partir d'une case occupée de la grille, l'ensemble contigu de
// cases formant un mot dans la direction donnée (perpendiculaire au sens
// de jeu, pour retrouver les mots secondaires formés par un croisement).
// Renvoie null si la case n'appartient à aucun mot d'au moins 2 lettres
// dans cette direction.
export function scanWordThroughCell(
  grid: (string | null)[][],
  row: number,
  col: number,
  direction: "ACROSS" | "DOWN"
): [number, number][] | null {
  if (!grid[row][col]) return null;

  if (direction === "ACROSS") {
    let startCol = col;
    while (startCol > 0 && grid[row][startCol - 1]) startCol--;
    let endCol = col;
    while (endCol < BOARD_SIZE - 1 && grid[row][endCol + 1]) endCol++;
    if (endCol === startCol) return null;
    const cells: [number, number][] = [];
    for (let c = startCol; c <= endCol; c++) cells.push([row, c]);
    return cells;
  }

  let startRow = row;
  while (startRow > 0 && grid[startRow - 1][col]) startRow--;
  let endRow = row;
  while (endRow < BOARD_SIZE - 1 && grid[endRow + 1][col]) endRow++;
  if (endRow === startRow) return null;
  const cells: [number, number][] = [];
  for (let r = startRow; r <= endRow; r++) cells.push([r, col]);
  return cells;
}

// Calcule le score d'un coup (mot posé à partir de la case row/col dans le
// sens donné) d'après l'état de la grille avant ce coup : valeur des
// lettres, bonus de lettre/mot (qui ne s'appliquent qu'aux cases
// nouvellement posées — une case déjà occupée garde sa valeur simple),
// mots secondaires formés par les croisements, et prime de Scrabble selon
// les règles fournies (par défaut +50 pour 7 lettres nouvelles).
//
// Une lettre saisie en minuscule est une lettre blanche (joker) : elle
// vaut 0 point quelle que soit sa position, mais reste affichée en
// majuscule sur la grille et compte normalement pour les bonus de case.
export function computeMoveScore(
  boardBeforeMove: (string | null)[][],
  word: string,
  row: number,
  col: number,
  direction: "ACROSS" | "DOWN",
  bingoRules: BingoRule[] = DEFAULT_BINGO_RULES
): number {
  const bonus = getBonusGrid();
  const boardAfter = boardBeforeMove.map((r) => [...r]);
  const newCells = new Set<string>();
  const blankCells = new Set<string>();

  for (let i = 0; i < word.length; i++) {
    const r = direction === "DOWN" ? row - 1 + i : row - 1;
    const c = direction === "ACROSS" ? col - 1 + i : col - 1;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
    if (!boardBeforeMove[r][c]) {
      const raw = word[i];
      boardAfter[r][c] = raw.toUpperCase();
      const key = `${r}-${c}`;
      newCells.add(key);
      if (raw === raw.toLowerCase() && raw !== raw.toUpperCase()) blankCells.add(key);
    }
  }

  function scoreWordCells(cells: [number, number][]): number {
    let letterScore = 0;
    let wordMultiplier = 1;
    for (const [r, c] of cells) {
      const key = `${r}-${c}`;
      const letter = boardAfter[r][c]!;
      const isNew = newCells.has(key);
      const value = blankCells.has(key) ? 0 : (FRENCH_LETTER_VALUES[letter] ?? 0);
      if (isNew) {
        const b = bonus[r][c];
        if (b === "DL") letterScore += value * 2;
        else if (b === "TL") letterScore += value * 3;
        else letterScore += value;
        if (b === "DW") wordMultiplier *= 2;
        else if (b === "TW") wordMultiplier *= 3;
      } else {
        letterScore += value;
      }
    }
    return letterScore * wordMultiplier;
  }

  const wordsToScore: [number, number][][] = [];
  const primaryCells = scanWordThroughCell(boardAfter, row - 1, col - 1, direction);
  if (primaryCells) wordsToScore.push(primaryCells);

  const perpendicular = direction === "ACROSS" ? "DOWN" : "ACROSS";
  for (const key of newCells) {
    const [r, c] = key.split("-").map(Number);
    const secondary = scanWordThroughCell(boardAfter, r, c, perpendicular);
    if (secondary) wordsToScore.push(secondary);
  }

  let total = wordsToScore.reduce((sum, cells) => sum + scoreWordCells(cells), 0);
  const rule = bingoRules.find((r) => r.tileCount === newCells.size);
  if (rule) total += rule.bonus;
  return total;
}
