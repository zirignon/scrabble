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

export function ScrabbleGrid({
  grid,
  cellSize = 28,
  dark = false,
}: {
  grid: (string | null)[][];
  cellSize?: number;
  dark?: boolean;
}) {
  const bonus = getBonusGrid();

  return (
    <div
      className={`inline-grid border-2 ${dark ? "border-white/40" : "border-black/40"}`}
      style={{
        gridTemplateColumns: `repeat(${BOARD_SIZE}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${BOARD_SIZE}, ${cellSize}px)`,
      }}
    >
      {grid.map((row, r) =>
        row.map((letter, c) => {
          const b = bonus[r][c];
          const border = dark ? "border-white/10" : "border-black/10";
          let bg: string;
          let textColor: string;
          if (letter) {
            bg = "bg-amber-100";
            textColor = "text-black";
          } else if (b) {
            bg = bonusColor[b];
            textColor = "text-white";
          } else {
            bg = dark ? "bg-white/5" : "bg-emerald-950/5";
            textColor = dark ? "text-white/40" : "text-black/40";
          }
          return (
            <div
              key={`${r}-${c}`}
              className={`flex items-center justify-center border ${border} ${bg} ${textColor} font-bold`}
              style={{ width: cellSize, height: cellSize, fontSize: cellSize * 0.5 }}
            >
              {letter ?? (b && cellSize >= 20 ? bonusLabel[b] : "")}
            </div>
          );
        })
      )}
    </div>
  );
}
