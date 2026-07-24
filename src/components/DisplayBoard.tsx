"use client";

import { useEffect, useState } from "react";
import type { DisplayData } from "@/lib/display";
import { LiveCountdown } from "@/components/LiveCountdown";
import { ScrabbleGrid } from "@/components/ScrabbleGrid";

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
    const interval = setInterval(() => {
      setView((v) => (v === "standings" ? "current" : "standings"));
    }, ROTATE_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen w-full bg-black text-white flex flex-col px-12 py-8 gap-6 overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/20 pb-4">
        <h1 className="text-4xl font-bold truncate">{data.tournamentName}</h1>
        <div className="flex gap-4 text-2xl shrink-0">
          <span className={view === "standings" ? "text-emerald-400" : "text-white/40"}>
            {data.standingsTitle}
          </span>
          <span className="text-white/30">·</span>
          <span className={view === "current" ? "text-emerald-400" : "text-white/40"}>
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
            <h2 className="text-3xl font-semibold mb-3 text-emerald-400">{group.name}</h2>
          )}
          <table className="w-full text-2xl border-collapse">
            <thead>
              <tr className="text-left text-white/50 text-xl border-b border-white/20">
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
                <tr key={row.rank} className="border-b border-white/10">
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
                  <td colSpan={10} className="py-4 text-white/40 text-xl">
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

function CurrentView({ data }: { data: DisplayData }) {
  const { current } = data;

  if (current.kind === "duplicate") {
    return (
      <div className="flex-1 overflow-auto flex flex-col gap-6">
        {current.timer && (
          <div className="flex items-center justify-center">
            <LiveCountdown
              baselineSeconds={current.timer.remainingSeconds}
              runningSince={current.timer.running ? current.timer.startedAt : null}
              className={`text-8xl font-bold tabular-nums ${
                current.timer.running ? "text-emerald-400" : "text-white/70"
              }`}
            />
          </div>
        )}
        <div className="flex flex-wrap items-start justify-center gap-10">
          {current.grid && <ScrabbleGrid grid={current.grid} cellSize={30} dark />}
          <table className="text-2xl border-collapse flex-1 min-w-[420px]">
            <thead>
              <tr className="text-left text-white/50 text-xl border-b border-white/20">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Joueur</th>
                <th className="py-2 pr-4 text-right">Score</th>
                <th className="py-2 pr-4 text-right">Pénalité</th>
                <th className="py-2 pr-4 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {current.rows.map((r) => (
                <tr key={r.rank} className="border-b border-white/10">
                  <td className="py-2 pr-4 font-bold">{r.rank}</td>
                  <td className="py-2 pr-4">{r.name}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{r.score}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{r.penalty}</td>
                  <td className="py-2 pr-4 text-right tabular-nums font-semibold">{r.net}</td>
                </tr>
              ))}
              {current.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-white/40 text-xl">
                    Pas encore de partie jouée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
            <h2 className="text-3xl font-semibold mb-3 text-emerald-400">{group.name}</h2>
          )}
          <table className="w-full text-2xl border-collapse">
            <thead>
              <tr className="text-left text-white/50 text-xl border-b border-white/20">
                <th className="py-2 pr-4">Table</th>
                <th className="py-2 pr-4">Domicile</th>
                <th className="py-2 pr-4 text-right">⏱</th>
                <th className="py-2 pr-4 text-right">Score</th>
                <th className="py-2 pr-4">Extérieur</th>
                <th className="py-2 pr-4">⏱</th>
              </tr>
            </thead>
            <tbody>
              {group.matches.map((m, mi) => (
                <tr key={mi} className="border-b border-white/10">
                  <td className="py-2 pr-4">{m.table ?? "—"}</td>
                  <td className="py-2 pr-4">{m.home}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {m.clock ? (
                      <LiveCountdown
                        baselineSeconds={m.clock.homeRemainingSeconds}
                        runningSince={m.clock.runningSide === "HOME" ? m.clock.startedAt : null}
                        className={m.clock.runningSide === "HOME" ? "text-emerald-400 font-semibold" : ""}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {m.isBye ? "Exempt" : `${m.homeScore ?? "–"} - ${m.awayScore ?? "–"}`}
                  </td>
                  <td className="py-2 pr-4">{m.away ?? ""}</td>
                  <td className="py-2 pr-4 tabular-nums">
                    {m.clock ? (
                      <LiveCountdown
                        baselineSeconds={m.clock.awayRemainingSeconds}
                        runningSince={m.clock.runningSide === "AWAY" ? m.clock.startedAt : null}
                        className={m.clock.runningSide === "AWAY" ? "text-emerald-400 font-semibold" : ""}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {group.matches.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-white/40 text-xl">
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
