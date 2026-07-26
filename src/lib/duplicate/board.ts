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
// qu'elle représente. Renvoie null si tout le tirage a été joué (rien à
// compléter).
export function formatReliquat(rack: string, playedLetters: PlayedLetter[]): string | null {
  // Le "+" est un séparateur d'affichage/saisie (voir validateGameRackAction),
  // pas une lettre du tirage — on l'ignore ici par sécurité s'il en reste un.
  const remaining = rack.replace(/\+/g, "").split("");
  for (const played of playedLetters) {
    const idx = remaining.indexOf(played.isBlank ? "?" : played.letter);
    if (idx !== -1) remaining.splice(idx, 1);
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
export function computeLastReliquat(moves: ReliquatMoveLike[]): string | null {
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
    return formatReliquat(lastMove.rack, playedLetters);
  }
  return formatReliquat(lastMove.rack, []);
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
// standards (normale, semi-rapide, blitz, joker, 7 sur 8) ne primetent que
// les tirages de 7 lettres posées (+50) ; la formule 7 et 8 ajoute une
// prime de 75 points pour 8 lettres posées.
export function getBingoRules(formula: string | null | undefined): BingoRule[] {
  if (formula === "SEPT_ET_HUIT") {
    return [{ tileCount: 7, bonus: 50 }, { tileCount: 8, bonus: 75 }];
  }
  return DEFAULT_BINGO_RULES;
}

// Durée par défaut du chronomètre de partie selon la formule (secondes).
export function getFormulaTimerSeconds(formula: string | null | undefined): number {
  if (formula === "SEMI_RAPIDE") return 120;
  if (formula === "BLITZ") return 60;
  return 180;
}

// Nombre d'avertissements gratuits (sur une même partie) avant que chaque
// avertissement supplémentaire ne coûte 5 points : 5 en Blitz, 3 dans les
// autres formules.
export function getFreeAvertissementCount(formula: string | null | undefined): number {
  return formula === "BLITZ" ? 5 : 3;
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
