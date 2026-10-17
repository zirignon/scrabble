"use client";

import { useState, useTransition } from "react";
import type { SolverSolution } from "@/lib/duplicate/solver";

// Panneau de saisie du coup de référence : recherche de solutions mise en
// avant (zone large, toujours visible une fois la recherche lancée) à
// gauche, choix du coup à enregistrer dans une colonne latérale à droite.
// Le coup enregistré DOIT provenir d'une solution de la liste déroulante
// (mot + référence + score) — pas de saisie manuelle possible, pour
// garantir que le coup de référence correspond toujours à un placement
// réellement valide trouvé par le solveur. Seule exception : une « Passe »
// (aucun mot jouable trouvé pour ce tirage), qui n'a besoin d'aucune
// solution.
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
  const [solutions, setSolutions] = useState<SolverSolution[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState("");
  const [isPass, setIsPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSearch() {
    setError(null);
    setSolutions(null);
    setSelectedIndex("");
    startTransition(async () => {
      try {
        const results = await findSolutions(rack);
        setSolutions(results);
      } catch {
        setError("Erreur lors de la recherche de solutions.");
      }
    });
  }

  const selected = solutions && selectedIndex !== "" ? solutions[Number(selectedIndex)] : null;
  const canSubmit = isPass || selected !== null;

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

        <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
          Solution à retenir (mot — référence — score)
          <select
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(e.target.value)}
            disabled={isPass || !solutions || solutions.length === 0}
            size={Math.min(12, Math.max(4, solutions?.length ?? 1))}
            className="rounded border border-black/10 dark:border-white/20 bg-transparent text-sm disabled:opacity-40"
          >
            <option value="" disabled>
              {solutions === null
                ? "Saisissez le tirage puis lancez la recherche…"
                : solutions.length === 0
                ? "Aucune solution trouvée pour ce tirage (ou dictionnaire non importé)."
                : "— Choisir une solution —"}
            </option>
            {solutions?.map((s, i) => (
              <option key={i} value={i}>
                {s.word.toUpperCase()} — {s.reference} ({s.score} pts)
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="sm:w-64 shrink-0 flex flex-col gap-2">
        <p className="text-xs font-medium text-black/60 dark:text-white/60">Coup à enregistrer</p>
        {selected ? (
          <p className="text-sm">
            <span className="font-semibold">{selected.word.toUpperCase()}</span>{" "}
            <span className="text-black/60 dark:text-white/60">{selected.reference}</span>{" "}
            <span className="text-black/50 dark:text-white/50">({selected.score} pts)</span>
          </p>
        ) : (
          <p className="text-xs text-black/40 dark:text-white/40">
            {isPass ? "Passe : aucun mot à enregistrer." : "Aucune solution sélectionnée."}
          </p>
        )}
        {/* Le formulaire n'envoie jamais une référence/un mot saisis
            librement : ils proviennent uniquement de la solution choisie
            ci-dessus, sauf en cas de passe (position neutre, sans effet
            sur la grille puisqu'aucun mot n'est posé). */}
        <input type="hidden" name="reference" value={selected ? selected.reference : isPass ? "H8" : ""} />
        <input type="hidden" name="word" value={selected ? selected.word : ""} />
        <input type="hidden" name="rack" value={rack} />
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            name="isPass"
            checked={isPass}
            onChange={(e) => {
              setIsPass(e.target.checked);
              if (e.target.checked) setSelectedIndex("");
            }}
          />
          Passe (aucun mot jouable trouvé)
        </label>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40"
        >
          + Coup de référence
        </button>
      </div>
    </form>
  );
}
