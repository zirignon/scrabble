import {
  BOARD_SIZE,
  computeMoveScore,
  formatReference,
  scanWordThroughCell,
  type BingoRule,
} from "@/lib/duplicate/board";

export interface SolverSolution {
  row: number;
  col: number;
  direction: "ACROSS" | "DOWN";
  reference: string;
  word: string;
  score: number;
}

function rackCounts(rack: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ch of rack.toUpperCase()) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  return counts;
}

// Essaie de composer les positions ouvertes d'un mot candidat à partir du
// tirage (lettres normales d'abord, jokers "?" en dernier recours) :
// renvoie le mot avec les lettres jouées en joker mises en minuscule
// (convention utilisée partout ailleurs pour signaler une lettre blanche),
// ou null si le tirage ne permet pas de composer ce mot.
function tryFillFromRack(
  candidate: string,
  openPositions: number[],
  counts: Map<string, number>
): string | null {
  const remaining = new Map(counts);
  const chars = candidate.split("");
  for (const pos of openPositions) {
    const letter = chars[pos];
    const have = remaining.get(letter) ?? 0;
    if (have > 0) {
      remaining.set(letter, have - 1);
      continue;
    }
    const blanks = remaining.get("?") ?? 0;
    if (blanks > 0) {
      remaining.set("?", blanks - 1);
      chars[pos] = letter.toLowerCase();
      continue;
    }
    return null;
  }
  return chars.join("");
}

function groupByLength(dictionary: Iterable<string>): Map<number, string[]> {
  const groups = new Map<number, string[]>();
  for (const word of dictionary) {
    const arr = groups.get(word.length);
    if (arr) arr.push(word);
    else groups.set(word.length, [word]);
  }
  return groups;
}

// Valide les mots secondaires (croisements) formés par les cases nouvellement
// posées, et le mot principal s'il fait au moins 2 lettres. Renvoie le score
// du coup si le placement est entièrement valide, ou null sinon (au moins
// un mot formé, mais introuvable dans le dictionnaire, ou aucun mot formé).
function validateAndScore(
  board: (string | null)[][],
  filledWord: string,
  row: number,
  col: number,
  direction: "ACROSS" | "DOWN",
  openPositions: number[],
  dictionary: Set<string>,
  bingoRules: BingoRule[]
): number | null {
  const boardAfter = board.map((r) => [...r]);
  for (let i = 0; i < filledWord.length; i++) {
    const r = direction === "DOWN" ? row - 1 + i : row - 1;
    const c = direction === "ACROSS" ? col - 1 + i : col - 1;
    boardAfter[r][c] = filledWord[i].toUpperCase();
  }

  let hasAnyWord = false;
  if (filledWord.length >= 2) {
    if (!dictionary.has(filledWord.toUpperCase())) return null;
    hasAnyWord = true;
  }

  const perpDir = direction === "ACROSS" ? "DOWN" : "ACROSS";
  for (const i of openPositions) {
    const r = direction === "DOWN" ? row - 1 + i : row - 1;
    const c = direction === "ACROSS" ? col - 1 + i : col - 1;
    const cells = scanWordThroughCell(boardAfter, r, c, perpDir);
    if (!cells) continue;
    const crossWord = cells.map(([rr, cc]) => boardAfter[rr][cc]).join("");
    if (!dictionary.has(crossWord)) return null;
    hasAnyWord = true;
  }

  if (!hasAnyWord) return null;

  return computeMoveScore(board, filledWord, row, col, direction, bingoRules);
}

// Cherche tous les coups possibles pour un tirage donné sur la grille en
// cours, à partir du dictionnaire fourni : essaie chaque case de départ
// possible dans les deux sens, filtre les mots du dictionnaire de la bonne
// longueur compatibles avec les lettres déjà en place, vérifie que le
// tirage permet de composer les lettres manquantes, valide les mots
// secondaires formés par les croisements, puis calcule le score. Renvoie
// les meilleures solutions triées par points décroissants.
export function findWordSolutions(
  board: (string | null)[][],
  rack: string,
  dictionary: Set<string>,
  bingoRules: BingoRule[],
  limit = 30
): SolverSolution[] {
  const counts = rackCounts(rack);
  const rackSize = rack.length;
  const wordsByLength = groupByLength(dictionary);
  const boardIsEmpty = board.every((row) => row.every((cell) => cell === null));
  const centerR = Math.floor(BOARD_SIZE / 2);
  const centerC = Math.floor(BOARD_SIZE / 2);

  const results: SolverSolution[] = [];
  const seen = new Set<string>();

  for (const direction of ["ACROSS", "DOWN"] as const) {
    for (let row = 1; row <= BOARD_SIZE; row++) {
      for (let col = 1; col <= BOARD_SIZE; col++) {
        const beforeR = direction === "DOWN" ? row - 2 : row - 1;
        const beforeC = direction === "ACROSS" ? col - 2 : col - 1;
        if (beforeR >= 0 && beforeC >= 0 && board[beforeR]?.[beforeC]) continue;

        const maxLen = direction === "ACROSS" ? BOARD_SIZE - col + 1 : BOARD_SIZE - row + 1;
        const fixed: (string | null)[] = [];
        let openCount = 0;
        let touchesExisting = false;

        for (let len = 1; len <= maxLen; len++) {
          const r = direction === "DOWN" ? row - 1 + len - 1 : row - 1;
          const c = direction === "ACROSS" ? col - 1 + len - 1 : col - 1;
          const letter = board[r][c];
          if (letter) {
            fixed.push(letter);
            touchesExisting = true;
          } else {
            fixed.push(null);
            openCount++;
          }

          const afterR = direction === "DOWN" ? row - 1 + len : row - 1;
          const afterC = direction === "ACROSS" ? col - 1 + len : col - 1;
          const afterFilled =
            afterR < BOARD_SIZE && afterC < BOARD_SIZE && board[afterR][afterC];
          if (afterFilled) continue;

          if (openCount === 0 || openCount > rackSize) continue;

          let touchesOk = touchesExisting;
          if (!touchesOk) {
            if (boardIsEmpty) {
              touchesOk =
                direction === "ACROSS"
                  ? row - 1 === centerR && col - 1 <= centerC && centerC <= col - 1 + len - 1
                  : col - 1 === centerC && row - 1 <= centerR && centerR <= row - 1 + len - 1;
            } else {
              for (let i = 0; i < len && !touchesOk; i++) {
                if (fixed[i] !== null) continue;
                const rr = direction === "DOWN" ? row - 1 + i : row - 1;
                const cc = direction === "ACROSS" ? col - 1 + i : col - 1;
                const neighbors =
                  direction === "ACROSS"
                    ? [
                        [rr - 1, cc],
                        [rr + 1, cc],
                      ]
                    : [
                        [rr, cc - 1],
                        [rr, cc + 1],
                      ];
                for (const [nr, nc] of neighbors) {
                  if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc]) {
                    touchesOk = true;
                    break;
                  }
                }
              }
            }
          }
          if (!touchesOk) continue;

          const bucket = wordsByLength.get(len);
          if (!bucket) continue;

          const openPositions: number[] = [];
          for (let i = 0; i < len; i++) if (fixed[i] === null) openPositions.push(i);

          for (const candidate of bucket) {
            let matches = true;
            for (let i = 0; i < len; i++) {
              if (fixed[i] !== null && candidate[i] !== fixed[i]) {
                matches = false;
                break;
              }
            }
            if (!matches) continue;

            const filled = tryFillFromRack(candidate, openPositions, counts);
            if (!filled) continue;

            const score = validateAndScore(
              board,
              filled,
              row,
              col,
              direction,
              openPositions,
              dictionary,
              bingoRules
            );
            if (score === null) continue;

            const key = `${row}-${col}-${direction}-${filled}`;
            if (seen.has(key)) continue;
            seen.add(key);

            results.push({
              row,
              col,
              direction,
              reference: formatReference(row, col, direction),
              word: filled,
              score,
            });
          }
        }
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
