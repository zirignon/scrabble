import { getBonusGrid, BOARD_SIZE } from "@/lib/duplicate/board";

const bonusColor: Record<string, string> = {
  TW: "bg-red-700",
  DW: "bg-pink-500",
  TL: "bg-blue-700",
  DL: "bg-sky-500",
};

const bonusLabel: Record<string, string> = {
  TW: "MC",
  DW: "MD",
  TL: "LC",
  DL: "LD",
};

// Notation : lignes A à O, colonnes 1 à 15 (ex. "H8" pour la case
// centrale), pour permettre de repérer une case sans ambiguïté.
const ROW_LETTERS = Array.from({ length: BOARD_SIZE }, (_, i) => String.fromCharCode(65 + i));

export function ScrabbleGrid({
  grid,
  cellSize = 28,
  dark = false,
  invalidCells,
}: {
  grid: (string | null)[][];
  cellSize?: number;
  dark?: boolean;
  invalidCells?: Set<string>;
}) {
  const bonus = getBonusGrid();
  const labelColor = dark ? "text-white/60" : "text-black/60";
  const labelSize = Math.max(14, Math.round(cellSize * 0.6));

  return (
    <div className="inline-grid" style={{ gridTemplateColumns: `${cellSize}px repeat(${BOARD_SIZE}, ${cellSize}px)` }}>
      <div style={{ width: cellSize, height: cellSize }} />
      {Array.from({ length: BOARD_SIZE }, (_, i) => i + 1).map((col) => (
        <div
          key={col}
          className={`flex items-center justify-center font-semibold ${labelColor}`}
          style={{ width: cellSize, height: cellSize, fontSize: labelSize }}
        >
          {col}
        </div>
      ))}

      {grid.map((row, r) => (
        <div key={`row-${r}`} className="contents">
          <div
            className={`flex items-center justify-center font-semibold ${labelColor}`}
            style={{ width: cellSize, height: cellSize, fontSize: labelSize }}
          >
            {ROW_LETTERS[r]}
          </div>
          {row.map((letter, c) => {
            const b = bonus[r][c];
            const invalid = invalidCells?.has(`${r}-${c}`) ?? false;
            const border = dark ? "border-white/10" : "border-black/10";
            let bg: string;
            let textColor: string;
            if (letter) {
              bg = invalid ? "bg-red-300" : "bg-amber-100";
              textColor = "text-black";
            } else if (b) {
              bg = bonusColor[b];
              textColor = "text-white";
            } else {
              bg = dark ? "bg-white/5" : "bg-emerald-950/5";
              textColor = dark ? "text-white/40" : "text-black/40";
            }
            const edgeColor = dark ? "border-white/40" : "border-black/40";
            const outerBorder = [
              r === 0 && `border-t-2 ${edgeColor}`,
              c === 0 && `border-l-2 ${edgeColor}`,
              r === BOARD_SIZE - 1 && `border-b-2 ${edgeColor}`,
              c === BOARD_SIZE - 1 && `border-r-2 ${edgeColor}`,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                key={`${r}-${c}`}
                className={`flex items-center justify-center border ${
                  invalid ? "border-2 border-red-600" : border
                } ${outerBorder} ${bg} ${textColor} font-bold`}
                style={{ width: cellSize, height: cellSize, fontSize: cellSize * 0.5 }}
              >
                {letter ?? (b && cellSize >= 20 ? bonusLabel[b] : "")}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
