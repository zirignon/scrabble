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

// Reconstruit la grille (15x15, lignes/colonnes numérotées 1 à 15 côté
// saisie) en rejouant les coups de référence dans l'ordre des tours :
// chaque lettre du mot est posée case par case selon le sens du coup.
export function reconstructBoard(moves: ReferenceMoveLike[]): (string | null)[][] {
  const grid: (string | null)[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(null)
  );

  const sorted = [...moves].sort((a, b) => a.turnNumber - b.turnNumber);
  for (const move of sorted) {
    if (move.isPass || !move.word) continue;
    for (let i = 0; i < move.word.length; i++) {
      const row = move.direction === "DOWN" ? move.row - 1 + i : move.row - 1;
      const col = move.direction === "ACROSS" ? move.col - 1 + i : move.col - 1;
      if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) continue;
      grid[row][col] = move.word[i].toUpperCase();
    }
  }

  return grid;
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

const BINGO_BONUS = 50;
const BINGO_TILE_COUNT = 7;

// Repère, à partir d'une case occupée de la grille, l'ensemble contigu de
// cases formant un mot dans la direction donnée (perpendiculaire au sens
// de jeu, pour retrouver les mots secondaires formés par un croisement).
// Renvoie null si la case n'appartient à aucun mot d'au moins 2 lettres
// dans cette direction.
function scanWordThroughCell(
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
// mots secondaires formés par les croisements, et bonus de 50 points si
// les 7 lettres du coup sont nouvelles.
export function computeMoveScore(
  boardBeforeMove: (string | null)[][],
  word: string,
  row: number,
  col: number,
  direction: "ACROSS" | "DOWN"
): number {
  const bonus = getBonusGrid();
  const boardAfter = boardBeforeMove.map((r) => [...r]);
  const newCells = new Set<string>();

  for (let i = 0; i < word.length; i++) {
    const r = direction === "DOWN" ? row - 1 + i : row - 1;
    const c = direction === "ACROSS" ? col - 1 + i : col - 1;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
    if (!boardBeforeMove[r][c]) {
      boardAfter[r][c] = word[i].toUpperCase();
      newCells.add(`${r}-${c}`);
    }
  }

  function scoreWordCells(cells: [number, number][]): number {
    let letterScore = 0;
    let wordMultiplier = 1;
    for (const [r, c] of cells) {
      const key = `${r}-${c}`;
      const letter = boardAfter[r][c]!;
      const isNew = newCells.has(key);
      const value = FRENCH_LETTER_VALUES[letter] ?? 0;
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
  if (newCells.size === BINGO_TILE_COUNT) total += BINGO_BONUS;
  return total;
}
