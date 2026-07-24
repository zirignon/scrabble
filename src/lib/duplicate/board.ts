export const BOARD_SIZE = 15;

export interface ReferenceMoveLike {
  turnNumber: number;
  row: number;
  col: number;
  direction: string;
  word: string | null;
  isPass: boolean;
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

// Disposition standard des cases bonus du Scrabble, pour un rendu
// visuellement conforme (n'affecte pas le calcul des scores, saisis
// indépendamment coup par coup).
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
