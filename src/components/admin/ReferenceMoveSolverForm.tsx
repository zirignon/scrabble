"use client";

import { useState, useTransition } from "react";
import type { SolverSolution } from "@/lib/duplicate/solver";

// Panneau de saisie du coup de référence : recherche de solutions mise en
// avant (zone large, toujours visible une fois la recherche lancée) à
// gauche, champs du coup à enregistrer (référence/mot/passe + soumission)
// dans une colonne latérale à droite — on choisit une solution dans la
// liste pour préremplir ces champs, ou on les saisit à la main.
export function ReferenceMoveSolverForm({
  addAction,
  findSolutions,
  turnNumber,
  initialRack = "",
}: {
  addAction: (formData: FormData) => Promise<void>;
  findSolutions: (rack: string) => Promise<SolverSolution[]>;
  turnNumber: number;
  initialRack?: string;
}) {
  const [rack, setRack] = useState(initialRack);
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
  }

  return (
    <form
      action={addAction}
      className="flex flex-col sm:flex-row gap-4 rounded border border-black/10 dark:border-white/20 p-3"
    >
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-black/50 dark:text-white/50">Tirage #{turnNumber}</span>
          <input
            type="text"
            name="rack"
            value={rack}
            onChange={(e) => setRack(e.target.value)}
            placeholder="Ex. AEHMNRS"
            className="w-28 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm uppercase"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={!rack.trim() || isPending}
            className="rounded bg-navy hover:bg-navy/90 dark:bg-navy-light dark:text-navy text-white px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
          >
            {isPending ? "Recherche…" : "Solutions"}
          </button>
        </div>

        {error && <p className="text-xs text-brick">{error}</p>}

        <div className="min-h-[10rem] max-h-[28rem] overflow-auto rounded border border-black/10 dark:border-white/20 text-sm">
          {solutions === null ? (
            <p className="p-3 text-xs text-black/40 dark:text-white/40">
              Saisissez le tirage puis lancez la recherche pour afficher tous les placements
              possibles (mot, référence, score).
            </p>
          ) : solutions.length === 0 ? (
            <p className="p-3 text-xs text-black/50 dark:text-white/50">
              Aucune solution trouvée pour ce tirage (ou dictionnaire non importé).
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-white dark:bg-navy">
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
      </div>

      <div className="sm:w-64 shrink-0 flex flex-col gap-2">
        <p className="text-xs font-medium text-black/60 dark:text-white/60">Coup à enregistrer</p>
        <input
          type="text"
          name="reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Ex. H4 / 4H"
          className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm uppercase"
        />
        <input
          type="text"
          name="word"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="Mot joué"
          className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
        />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="isPass" />
          Passe
        </label>
        <button
          type="submit"
          className="rounded bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 text-sm font-medium transition-colors"
        >
          + Coup de référence
        </button>
      </div>
    </form>
  );
}
