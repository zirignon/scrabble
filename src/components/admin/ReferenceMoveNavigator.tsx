"use client";

import { useEffect, useState } from "react";
import { ReferenceMoveSolverForm } from "@/components/admin/ReferenceMoveSolverForm";
import type { SolverSolution } from "@/lib/duplicate/solver";

export interface NavigatorMove {
  id: string;
  turnNumber: number;
  reference: string;
  rack: string;
  word: string;
  points: number;
  isPass: boolean;
}

// Remplace la liste de tous les coups (une ligne par tour, potentiellement
// très longue) par une seule ligne : un sélecteur "Coup #" fait apparaître
// les champs du tour choisi, à valider ou supprimer, sans surcharger
// l'espace avec l'historique complet.
export function ReferenceMoveNavigator({
  moves,
  addAction,
  updateActionBase,
  deleteActionBase,
  findSolutions,
  initialRack,
}: {
  moves: NavigatorMove[];
  addAction: (formData: FormData) => Promise<void>;
  updateActionBase: (moveId: string, formData: FormData) => Promise<void>;
  deleteActionBase: (moveId: string) => Promise<void>;
  findSolutions: (rack: string) => Promise<SolverSolution[]>;
  initialRack: string;
}) {
  const maxTurn = moves.length > 0 ? moves[moves.length - 1].turnNumber : 0;
  const [turnNumber, setTurnNumber] = useState(maxTurn + 1);

  // Après l'ajout ou la suppression d'un coup, revient automatiquement sur
  // le prochain tour à saisir.
  useEffect(() => {
    setTurnNumber(maxTurn + 1);
  }, [maxTurn]);

  const selectedMove = moves.find((m) => m.turnNumber === turnNumber) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="coup-select" className="text-black/60 dark:text-white/60">
          Coup
        </label>
        <select
          id="coup-select"
          value={turnNumber}
          onChange={(e) => setTurnNumber(Number(e.target.value))}
          className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
        >
          {moves.map((m) => (
            <option key={m.id} value={m.turnNumber}>
              #{m.turnNumber}
            </option>
          ))}
          <option value={maxTurn + 1}>#{maxTurn + 1} (nouveau)</option>
        </select>
      </div>

      {selectedMove ? (
        <form
          key={selectedMove.id}
          action={updateActionBase.bind(null, selectedMove.id)}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            type="text"
            name="reference"
            defaultValue={selectedMove.reference}
            placeholder="Ex. H4 / 4H"
            className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm uppercase"
          />
          <input
            type="text"
            name="rack"
            defaultValue={selectedMove.rack}
            placeholder="Tirage"
            className="w-24 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm uppercase"
          />
          <input
            type="text"
            name="word"
            defaultValue={selectedMove.word}
            placeholder="Mot joué"
            className="w-32 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
          />
          <span className="w-16 text-sm text-black/60 dark:text-white/60">
            {selectedMove.points} pts
          </span>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="isPass" defaultChecked={selectedMove.isPass} />
            Passe
          </label>
          <button
            type="submit"
            className="rounded bg-emerald-700 text-white px-3 py-1.5 text-sm"
          >
            OK
          </button>
          <button
            type="submit"
            formAction={deleteActionBase.bind(null, selectedMove.id)}
            className="rounded bg-brick hover:bg-brick/90 text-white px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Supprimer
          </button>
        </form>
      ) : (
        <ReferenceMoveSolverForm
          // Remonte le formulaire (et donc réinitialise son état local) dès
          // que le tirage validé par l'arbitre change, pour que le champ
          // tirage reste synchronisé sans que l'arbitre ait à le ressaisir.
          key={`${turnNumber}:${initialRack}`}
          addAction={addAction}
          findSolutions={findSolutions}
          turnNumber={turnNumber}
          initialRack={initialRack}
        />
      )}
    </div>
  );
}
