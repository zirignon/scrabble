"use client";

import { useEffect, useRef, useState } from "react";
import type { DisplayData, DisplayGameTimer } from "@/lib/display";
import { LiveCountdown } from "@/components/LiveCountdown";
import { ScrabbleGrid } from "@/components/ScrabbleGrid";
import { FRENCH_LETTER_VALUES } from "@/lib/duplicate/board";
import { computeLiveRemaining, formatClock } from "@/lib/timer";
import { playBeep, unlockAudioOnFirstInteraction } from "@/lib/beep";

const ROTATE_MS = 12000;

export function DisplayBoard({
  tournamentId,
  initialData,
}: {
  tournamentId: string;
  initialData: DisplayData;
}) {
  const [data, setData] = useState<DisplayData>(initialData);
  const [view, setView] = useState<"standings" | "current">("standings");

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
    if (data.displayMode === "STANDINGS") {
      setView("standings");
      return;
    }
    if (data.displayMode === "CURRENT") {
      setView("current");
      return;
    }
    const interval = setInterval(() => {
      setView((v) => (v === "standings" ? "current" : "standings"));
    }, ROTATE_MS);
    return () => clearInterval(interval);
  }, [data.displayMode]);

  return (
    <div className="min-h-screen w-full bg-sky-100 text-slate-900 flex flex-col px-12 py-8 gap-6 overflow-hidden">
      <header className="flex items-center justify-between border-b border-black/20 pb-4">
        <h1 className="text-4xl font-bold truncate">{data.tournamentName}</h1>
        <div className="flex gap-4 text-2xl shrink-0">
          <span className={view === "standings" ? "text-emerald-800" : "text-black/40"}>
            {data.standingsTitle}
          </span>
          <span className="text-black/30">·</span>
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
  const columns = Math.min(data.standingsGroups.length, 2) || 1;
  return (
    <div className="flex-1 grid gap-10 overflow-auto" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {data.standingsGroups.map((group, gi) => (
        <div key={gi}>
          {group.name && (
            <h2 className="text-3xl font-semibold mb-3 text-emerald-800">{group.name}</h2>
          )}
          <table className="w-full text-2xl border-collapse">
            <thead>
              <tr className="text-left text-black/50 text-xl border-b border-black/20">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Nom</th>
                {group.rows[0]?.columns.map((c) => (
                  <th key={c.label} className="py-2 pr-4 text-right">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.rank} className="border-b border-black/10">
                  <td className="py-2 pr-4 font-bold">{row.rank}</td>
                  <td className="py-2 pr-4">{row.name}</td>
                  {row.columns.map((c) => (
                    <td key={c.label} className="py-2 pr-4 text-right tabular-nums">
                      {c.value}
                    </td>
                  ))}
                </tr>
              ))}
              {group.rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-4 text-black/40 text-xl">
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
    <span className={`text-8xl font-bold tabular-nums ${colorClass}`}>{formatClock(remaining)}</span>
  );
}

function RackColumn({ rack }: { rack: string }) {
  const cellSize = 56;
  const letters = rack.split("");
  return (
    <div className="flex flex-col gap-2 bg-white p-4 rounded-lg shadow-xl border border-black/10">
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

  if (current.kind === "duplicate") {
    return (
      <div className="flex-1 overflow-auto flex flex-col gap-6">
        {current.timer && (
          <div className="flex items-center justify-center">
            <DisplayTimer timer={current.timer} />
          </div>
        )}
        <div className="flex flex-1 items-start justify-center gap-10">
          {current.grid && (
            <div className="bg-white p-4 rounded-lg shadow-xl border border-black/10">
              <ScrabbleGrid grid={current.grid} cellSize={38} />
            </div>
          )}
          {current.currentRack && <RackColumn rack={current.currentRack} />}
        </div>
      </div>
    );
  }

  const columns = Math.min(current.groups.length, 2) || 1;
  return (
    <div className="flex-1 grid gap-10 overflow-auto" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {current.groups.map((group, gi) => (
        <div key={gi}>
          {group.name && (
            <h2 className="text-3xl font-semibold mb-3 text-emerald-800">{group.name}</h2>
          )}
          <table className="w-full text-2xl border-collapse table-fixed">
            <thead>
              <tr className="text-left text-black/50 text-lg border-b border-black/20">
                <th className="py-2 pr-4 w-[8%]">Table</th>
                <th className="py-2 pr-4 w-[26%]">Domicile</th>
                <th className="py-2 pr-4 w-[5%] text-right">⏱</th>
                <th className="py-2 pr-4 w-[22%] text-right">Score</th>
                <th className="py-2 pr-4 w-[26%]">Extérieur</th>
                <th className="py-2 pr-4 w-[13%]">⏱</th>
              </tr>
            </thead>
            <tbody>
              {group.matches.map((m, mi) => (
                <tr key={mi} className="border-b border-black/10 align-middle">
                  <td className="py-3 pr-2 tabular-nums">{m.table ?? "—"}</td>
                  <td className="py-3 pr-4 text-xl leading-tight break-words">{m.home}</td>
                  <td className="py-3 pr-2 text-right tabular-nums text-lg whitespace-nowrap overflow-hidden">
                    {m.clock ? (
                      <LiveCountdown
                        baselineSeconds={m.clock.homeRemainingSeconds}
                        runningSince={m.clock.runningSide === "HOME" ? m.clock.startedAt : null}
                        className={m.clock.runningSide === "HOME" ? "text-emerald-800 font-semibold" : ""}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-xl whitespace-nowrap overflow-hidden">
                    {m.isBye ? "Exempt" : `${m.homeScore ?? "–"} - ${m.awayScore ?? "–"}`}
                  </td>
                  <td className="py-3 pr-4 text-xl leading-tight break-words">{m.away ?? ""}</td>
                  <td className="py-3 pr-2 tabular-nums text-lg whitespace-nowrap overflow-hidden">
                    {m.clock ? (
                      <LiveCountdown
                        baselineSeconds={m.clock.awayRemainingSeconds}
                        runningSince={m.clock.runningSide === "AWAY" ? m.clock.startedAt : null}
                        className={m.clock.runningSide === "AWAY" ? "text-emerald-800 font-semibold" : ""}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {group.matches.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-black/40 text-xl">
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
