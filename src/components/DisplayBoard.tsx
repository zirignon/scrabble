"use client";

import { useEffect, useRef, useState } from "react";
import type { DisplayData, DisplayGameTimer } from "@/lib/display";
import { ScrabbleGrid } from "@/components/ScrabbleGrid";
import { FRENCH_LETTER_VALUES } from "@/lib/duplicate/board";
import { computeLiveRemaining, formatClock } from "@/lib/timer";
import { playBeep, unlockAudioOnFirstInteraction } from "@/lib/beep";

const ROTATE_MS = 12000;

// La grille Scrabble (15x15 + libellés) et le chevalet ont une taille de
// case fixe en pixels (pas des classes Tailwind responsives) : sans cela,
// la taille pensée pour un grand écran de projection (cellSize=38, soit
// ~600px de large) déborderait largement d'un téléphone. Recalculée au
// redimensionnement plutôt qu'une seule fois au montage, pour suivre une
// rotation d'écran ou un changement de fenêtre.
function useResponsiveCellSize(desktopSize: number): number {
  const [cellSize, setCellSize] = useState(desktopSize);
  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      if (w < 480) setCellSize(Math.round(desktopSize * 0.42));
      else if (w < 768) setCellSize(Math.round(desktopSize * 0.6));
      else if (w < 1024) setCellSize(Math.round(desktopSize * 0.8));
      else setCellSize(desktopSize);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [desktopSize]);
  return cellSize;
}

// Sous ce seuil, les groupes (Finale / Match pour la 3e place, poules...)
// s'empilent en une seule colonne au lieu de se partager côte à côte la
// largeur de l'écran — sur un téléphone, 2 colonnes de ~195px compressaient
// chaque tableau au point de tronquer jusqu'aux en-têtes ("Table" devenait
// "T..."). L'ordre d'empilement suit l'ordre naturel des groupes (la
// finale avant le match pour la 3e place, voir groupsMap dans
// src/lib/display.ts), donc la finale se retrouve en haut.
function useIsNarrowViewport(breakpoint = 640): boolean {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    function update() {
      setIsNarrow(window.innerWidth < breakpoint);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [breakpoint]);
  return isNarrow;
}

export function DisplayBoard({
  tournamentId,
  initialData,
}: {
  tournamentId: string;
  initialData: DisplayData;
}) {
  const [data, setData] = useState<DisplayData>(initialData);
  const [autoView, setAutoView] = useState<"standings" | "current">("standings");
  // Une fois en phase finale à élimination directe, le classement général
  // reste figé (voir DisplayData.standingsAvailable) : l'écran reste sur
  // les matchs en cours en permanence, même si l'organisateur avait figé
  // le mode sur STANDINGS avant que la phase finale ne commence.
  const view = !data.standingsAvailable
    ? "current"
    : data.displayMode === "STANDINGS"
      ? "standings"
      : data.displayMode === "CURRENT"
        ? "current"
        : autoView;
  // Rien n'est plus important que la finale elle-même : le nom du tournoi
  // (toujours affiché jusqu'ici) cède la place à "FINALE" en grand une fois
  // ce tour atteint, plutôt que de rester le titre dominant de l'écran.
  const isFinaleStage =
    data.current.kind === "matches" &&
    (data.current.label === "Finale" || data.current.label.startsWith("Finale "));

  useEffect(() => {
    // Les navigateurs bloquent la lecture audio sans interaction préalable :
    // le premier clic/appui touche sur l'écran de projection débloque la
    // sonnerie du minuteur pour le reste de la session.
    unlockAudioOnFirstInteraction();
  }, []);

  useEffect(() => {
    // Flux SSE : le serveur pousse une mise à jour dès qu'une action
    // pertinente est enregistrée (score, chrono, ronde...), au lieu
    // d'attendre un sondage périodique. L'EventSource se reconnecte tout
    // seul en cas de coupure réseau.
    const source = new EventSource(`/api/tournois/${tournamentId}/affichage/stream`);
    source.onmessage = (event) => {
      setData(JSON.parse(event.data));
    };
    return () => source.close();
  }, [tournamentId]);

  useEffect(() => {
    // Un mode figé par l'organisateur (STANDINGS/CURRENT) désactive
    // l'alternance automatique et impose la vue choisie ; en mode AUTO,
    // l'écran continue d'alterner toutes les 12s comme avant.
    if (data.displayMode !== "AUTO") return;
    const interval = setInterval(() => {
      setAutoView((v) => (v === "standings" ? "current" : "standings"));
    }, ROTATE_MS);
    return () => clearInterval(interval);
  }, [data.displayMode]);

  return (
    <div className="min-h-screen w-full bg-sky-100 text-slate-900 flex flex-col px-4 py-4 gap-3 overflow-x-hidden sm:px-8 sm:py-6 sm:gap-5 lg:px-12 lg:py-8 lg:gap-6">
      <header className="flex items-center justify-between gap-3 border-b border-black/20 pb-3 sm:pb-4">
        <h1 className="text-xl font-bold truncate sm:text-2xl lg:text-4xl">{isFinaleStage ? "FINALE" : data.tournamentName}</h1>
        <div className="flex gap-2 text-sm shrink-0 sm:gap-4 sm:text-lg lg:text-2xl">
          {data.standingsAvailable && (
            <>
              <span className={view === "standings" ? "text-emerald-800" : "text-black/40"}>
                {data.standingsTitle}
              </span>
              <span className="text-black/30">·</span>
            </>
          )}
          <span className={view === "current" ? "text-emerald-800" : "text-black/40"}>
            {data.current.label}
          </span>
        </div>
      </header>

      {view === "standings" ? <StandingsView data={data} /> : <CurrentView data={data} />}
    </div>
  );
}

function StandingsView({ data }: { data: DisplayData }) {
  const isNarrow = useIsNarrowViewport();
  const columns = isNarrow ? 1 : Math.min(data.standingsGroups.length, 2) || 1;
  return (
    <div
      className="flex-1 grid content-start gap-4 overflow-auto sm:gap-6 lg:gap-10"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {data.standingsGroups.map((group, gi) => (
        <div key={gi}>
          {group.name && (
            <h2 className="text-lg font-semibold mb-2 text-emerald-800 sm:text-xl sm:mb-3 lg:text-3xl">{group.name}</h2>
          )}
          <table className="w-full text-sm border-collapse sm:text-lg lg:text-2xl">
            <thead>
              <tr className="text-left text-black/50 text-xs border-b border-black/20 sm:text-base lg:text-xl">
                <th className="py-1 pr-2 sm:py-2 sm:pr-4">#</th>
                <th className="py-1 pr-2 sm:py-2 sm:pr-4">Nom</th>
                {group.rows[0]?.columns.map((c) => (
                  <th key={c.label} className="py-1 pr-2 text-right whitespace-nowrap sm:py-2 sm:pr-4">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.rank} className="border-b border-black/10">
                  <td className="py-1 pr-2 font-bold sm:py-2 sm:pr-4">{row.rank}</td>
                  <td className="py-1 pr-2 sm:py-2 sm:pr-4">{row.name}</td>
                  {row.columns.map((c) => (
                    <td key={c.label} className="py-1 pr-2 text-right tabular-nums sm:py-2 sm:pr-4">
                      {c.value}
                    </td>
                  ))}
                </tr>
              ))}
              {group.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-black/40 text-sm sm:text-xl">
                    Pas encore de classement.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// Minuteur de la partie en cours (duplicate) : passe en rouge et déclenche
// une sonnerie une seule fois lorsqu'il descend sous le repère d'alerte du
// rythme de la partie (30 ou 20 secondes, règlement §3.3), pour alerter la
// salle sans distraire les joueurs le reste du temps.
function DisplayTimer({ timer }: { timer: DisplayGameTimer }) {
  const [now, setNow] = useState(() => Date.now());
  const hasWarnedRef = useRef(false);

  useEffect(() => {
    if (!timer.running) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timer.running, timer.startedAt]);

  const remaining = timer.running
    ? computeLiveRemaining(timer.remainingSeconds, timer.startedAt)
    : timer.remainingSeconds;
  void now;

  const isWarning = timer.running && remaining <= timer.alertSeconds;

  useEffect(() => {
    if (!isWarning) {
      hasWarnedRef.current = false;
      return;
    }
    if (!hasWarnedRef.current) {
      hasWarnedRef.current = true;
      playBeep();
    }
  }, [isWarning]);

  const colorClass = isWarning
    ? "text-brick"
    : timer.running
      ? "text-emerald-800"
      : "text-black/70";

  return (
    <span className={`text-4xl font-bold tabular-nums sm:text-6xl lg:text-8xl ${colorClass}`}>{formatClock(remaining)}</span>
  );
}

function RackColumn({ rack }: { rack: string }) {
  const cellSize = useResponsiveCellSize(56);
  const letters = rack.split("");
  return (
    <div className="flex flex-col gap-1 bg-white p-2 rounded-lg shadow-xl border border-black/10 sm:gap-2 sm:p-4">
      {letters.map((letter, i) => {
        if (letter === "+") {
          return (
            <div
              key={i}
              className="flex items-center justify-center bg-slate-100 border border-black/10 rounded-sm font-bold text-black/40"
              style={{ width: cellSize, height: cellSize, fontSize: cellSize * 0.5 }}
            >
              +
            </div>
          );
        }
        const value = FRENCH_LETTER_VALUES[letter.toUpperCase()];
        return (
          <div
            key={i}
            className="relative flex items-center justify-center bg-amber-100 border border-black/20 rounded-sm font-bold text-black"
            style={{ width: cellSize, height: cellSize, fontSize: cellSize * 0.5 }}
          >
            {letter}
            {value !== undefined && (
              <span
                className="absolute bottom-0.5 right-1 font-semibold leading-none"
                style={{ fontSize: Math.max(9, cellSize * 0.22) }}
              >
                {value}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CurrentView({ data }: { data: DisplayData }) {
  const { current } = data;
  const gridCellSize = useResponsiveCellSize(38);
  const isNarrow = useIsNarrowViewport();

  if (current.kind === "duplicate") {
    return (
      <div className="flex-1 overflow-auto flex flex-col gap-3 sm:gap-6">
        {current.timer && (
          <div className="flex items-center justify-center">
            <DisplayTimer timer={current.timer} />
          </div>
        )}
        <div className="flex flex-1 items-start justify-center gap-3 sm:gap-10">
          {current.grid && (
            <div className="bg-white p-2 rounded-lg shadow-xl border border-black/10 sm:p-4">
              <ScrabbleGrid grid={current.grid} cellSize={gridCellSize} />
            </div>
          )}
          {current.currentRack && <RackColumn rack={current.currentRack} />}
        </div>
      </div>
    );
  }

  const columns = isNarrow ? 1 : Math.min(current.groups.length, 2) || 1;
  return (
    <div
      className="flex-1 grid content-start gap-4 overflow-auto sm:gap-6 lg:gap-10"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {current.groups.map((group, gi) => (
        <div key={gi}>
          {group.name && (
            <h2 className="text-lg font-semibold mb-2 text-emerald-800 sm:text-xl sm:mb-3 lg:text-3xl">{group.name}</h2>
          )}
          {/* table-fixed + colonnes en % : sans largeur fixe, un nom de
              joueur long pousserait la colonne Score hors de l'écran sur
              un petit viewport. Les en-têtes ont besoin de leur propre
              `overflow-hidden` (pas seulement les cellules) : un <th> sans
              ça déborde visuellement sur la colonne suivante au lieu
              d'être tronqué, ce qui produisait un chevauchement illisible
              ("Table"/"Domicile" superposés) sur téléphone. */}
          <table className="w-full text-xs border-collapse table-fixed sm:text-base md:text-xl lg:text-2xl">
            <thead>
              <tr className="text-left text-black/50 text-[10px] border-b border-black/20 sm:text-sm lg:text-lg">
                <th className="py-1 pr-1 w-[14%] truncate sm:py-2 sm:pr-4 sm:w-[9%]">Table</th>
                <th className="py-1 pr-1 w-[30%] truncate sm:py-2 sm:pr-4 sm:w-[33%]">Domicile</th>
                <th className="py-1 pr-1 w-[26%] text-center truncate sm:py-2 sm:pr-4 sm:w-[25%]">Score</th>
                <th className="py-1 pr-1 w-[30%] truncate sm:py-2 sm:pr-4 sm:w-[33%]">Extérieur</th>
              </tr>
            </thead>
            <tbody>
              {group.matches.map((m, mi) => (
                <tr key={mi} className="border-b border-black/10 align-middle">
                  <td className="py-1.5 pr-1 tabular-nums sm:py-3 sm:pr-2">{m.table ?? "—"}</td>
                  <td className="py-1.5 pr-1 leading-tight break-words sm:py-3 sm:pr-4">{m.home}</td>
                  <td className="py-1.5 pr-1 text-center tabular-nums whitespace-nowrap overflow-hidden sm:py-3 sm:pr-4">
                    {m.homeScore ?? "–"} - {m.awayScore ?? "–"}
                  </td>
                  <td className="py-1.5 pr-1 leading-tight break-words sm:py-3 sm:pr-4">{m.away ?? ""}</td>
                </tr>
              ))}
              {group.matches.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-black/40 text-sm sm:text-xl">
                    Aucun match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
