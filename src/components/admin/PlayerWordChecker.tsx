"use client";

import { useState, useTransition } from "react";
import type { PlayerWordCheckResult } from "@/lib/actions/duplicate";
import type { SolverSolution } from "@/lib/duplicate/solver";

// Correcteur pour la saisie du coup d'un joueur : l'arbitre tape le mot
// annoncé, le logiciel renvoie tous les placements valides (référence +
// score) sur la grille actuelle — pas besoin de connaître la référence à
// l'avance. L'arbitre choisit le bon placement dans la liste (ou constate
// qu'elle est vide : mot inconnu ou injouable avec ce tirage). Le choix
// alimente des champs cachés (word_/reference_) soumis avec le reste de la
// ligne ; saveTurnScoresAction revérifie ce placement au moment d'enregistrer
// (defense in depth, voir validatePlayerWord).
export function PlayerWordChecker({
  playerId,
  formId,
  initialWord,
  initialReference,
  checkWord,
}: {
  playerId: string;
  formId: string;
  initialWord: string;
  initialReference: string;
  checkWord: (word: string) => Promise<PlayerWordCheckResult>;
}) {
  const [word, setWord] = useState(initialWord);
  const [reference, setReference] = useState(initialReference);
  const [result, setResult] = useState<PlayerWordCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCheck() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await checkWord(word);
        setResult(res);
      } catch {
        setError("Erreur lors de la vérification du mot.");
      }
    });
  }

  function pick(solution: SolverSolution) {
    setReference(solution.reference);
    setResult(null);
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex gap-0.5">
        <input
          type="text"
          value={word}
          onChange={(e) => {
            setWord(e.target.value);
            setReference("");
            setResult(null);
          }}
          placeholder="Mot"
          className="w-16 rounded border border-black/10 dark:border-white/20 px-1 py-0.5 text-center bg-transparent text-xs focus:outline-none"
        />
        <button
          type="button"
          onClick={handleCheck}
          disabled={!word.trim() || isPending}
          title="Cherche tous les placements valides de ce mot sur la grille actuelle"
          className="rounded border border-black/10 dark:border-white/20 px-1 text-[10px] disabled:opacity-40 hover:bg-navy/[.04] dark:hover:bg-navy-light/[.08]"
        >
          {isPending ? "…" : "Vérifier"}
        </button>
      </div>
      <input type="hidden" form={formId} name={`word_${playerId}`} value={reference ? word.trim() : ""} />
      <input type="hidden" form={formId} name={`reference_${playerId}`} value={reference} />

      {reference && (
        <span className="text-[10px] text-moss dark:text-moss-light">{reference} choisi</span>
      )}
      {error && <span className="text-[10px] text-brick">{error}</span>}
      {result && result.placements.length === 0 && (
        <span className="text-[10px] text-brick">
          {result.inDictionary ? "Valide mais injouable ici" : "Mot introuvable dans le dictionnaire"}
        </span>
      )}
      {result && result.placements.length > 0 && (
        <ul className="flex flex-col gap-0.5 max-h-20 overflow-auto text-[10px]">
          {result.placements.map((p) => (
            <li key={`${p.row}-${p.col}-${p.direction}`}>
              <button type="button" onClick={() => pick(p)} className="underline whitespace-nowrap">
                {p.reference} ({p.score} pts)
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
