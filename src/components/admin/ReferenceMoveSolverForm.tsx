"use client";

import { useState, useTransition } from "react";
import type { SolverSolution } from "@/lib/duplicate/solver";

export function ReferenceMoveSolverForm({
  addAction,
  findSolutions,
  turnNumber,
}: {
  addAction: (formData: FormData) => Promise<void>;
  findSolutions: (rack: string) => Promise<SolverSolution[]>;
  turnNumber: number;
}) {
  const [rack, setRack] = useState("");
  const [reference, setReference] = useState("");
  const [word, setWord] = useState("");
  const [solutions, setSolutions] = useState<SolverSolution[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSearch() {
    setError(null);
    setSolutions(null);
    startTransition(async () => {
      try {
        const results = await findSolutions(rack);
        setSolutions(results);
      } catch {
        setError("Erreur lors de la recherche de solutions.");
      }
    });
  }

  function pick(solution: SolverSolution) {
    setReference(solution.reference);
    setWord(solution.word);
    setSolutions(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <form action={addAction} className="flex flex-wrap items-center gap-2">
        <span className="w-10 text-black/60 dark:text-white/60 text-sm">#{turnNumber}</span>
        <input
          type="text"
          name="reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Ex. H4 / 4H"
          className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm uppercase"
        />
        <input
          type="text"
          name="rack"
          value={rack}
          onChange={(e) => setRack(e.target.value)}
          placeholder="Tirage"
          className="w-24 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm uppercase"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={!rack.trim() || isPending}
          className="rounded border border-black/10 dark:border-white/20 px-2 py-1 text-xs disabled:opacity-40"
        >
          {isPending ? "Recherche…" : "Solutions"}
        </button>
        <input
          type="text"
          name="word"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="Mot joué"
          className="w-32 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
        />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="isPass" />
          Passe
        </label>
        <button
          type="submit"
          className="rounded border border-black/10 dark:border-white/20 px-3 py-1.5 text-sm"
        >
          + Coup de référence
        </button>
      </form>

      {error && <p className="text-xs text-brick">{error}</p>}

      {solutions && (
        <div className="max-w-xl max-h-56 overflow-auto rounded border border-black/10 dark:border-white/20 text-sm">
          {solutions.length === 0 ? (
            <p className="p-2 text-black/50 dark:text-white/50 text-xs">
              Aucune solution trouvée pour ce tirage (ou dictionnaire non importé).
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10 text-xs text-black/50 dark:text-white/50">
                  <th className="py-1.5 px-2">Mot</th>
                  <th className="py-1.5 px-2">Réf.</th>
                  <th className="py-1.5 px-2 text-right">Pts</th>
                  <th className="py-1.5 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {solutions.map((s, i) => (
                  <tr key={i} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-1.5 px-2 font-semibold">{s.word.toUpperCase()}</td>
                    <td className="py-1.5 px-2 tabular-nums">{s.reference}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{s.score}</td>
                    <td className="py-1.5 px-2">
                      <button
                        type="button"
                        onClick={() => pick(s)}
                        className="rounded bg-moss text-white px-2 py-0.5 text-xs"
                      >
                        Choisir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
