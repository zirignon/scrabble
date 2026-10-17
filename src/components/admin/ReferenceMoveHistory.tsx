"use client";

import { useState } from "react";

export interface NavigatorMove {
  id: string;
  turnNumber: number;
  reference: string;
  rack: string;
  word: string;
  points: number;
  isPass: boolean;
}

// Historique complet des coups de référence, toujours affiché (plus de
// sélecteur masquant tous les tours sauf un) : chaque ligne existante se
// transforme en formulaire d'édition sur demande ("Modifier"), avec
// suppression possible depuis ce même formulaire. L'ajout du prochain coup
// se fait séparément (voir ReferenceMoveSolverForm, affiché à côté sur la
// page d'arbitrage), ce composant ne gère que les coups déjà saisis.
export function ReferenceMoveHistory({
  moves,
  canManage,
  updateActionBase,
  deleteActionBase,
}: {
  moves: NavigatorMove[];
  canManage: boolean;
  updateActionBase?: (moveId: string, formData: FormData) => Promise<void>;
  deleteActionBase?: (moveId: string) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pr-4">Coup</th>
            <th className="py-2 pr-4">Référence</th>
            <th className="py-2 pr-4">Tirage</th>
            <th className="py-2 pr-4">Mot</th>
            <th className="py-2 pr-4">Points</th>
            <th className="py-2 pr-4">Passe</th>
            {canManage && <th className="py-2 pr-4"></th>}
          </tr>
        </thead>
        <tbody>
          {moves.map((move) => {
            if (canManage && editingId === move.id && updateActionBase && deleteActionBase) {
              return (
                <tr key={move.id} className="border-b border-black/5 dark:border-white/5">
                  <td colSpan={7} className="py-2">
                    <form
                      action={updateActionBase.bind(null, move.id)}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="w-10 text-black/60 dark:text-white/60 text-sm">
                        #{move.turnNumber}
                      </span>
                      <input
                        type="text"
                        name="reference"
                        defaultValue={move.reference}
                        placeholder="Ex. H4 / 4H"
                        className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm uppercase"
                      />
                      <input
                        type="text"
                        name="rack"
                        defaultValue={move.rack}
                        placeholder="Tirage"
                        className="w-24 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm uppercase"
                      />
                      <input
                        type="text"
                        name="word"
                        defaultValue={move.word}
                        placeholder="Mot joué"
                        className="w-32 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
                      />
                      <span className="w-16 text-sm text-black/60 dark:text-white/60">
                        {move.points} pts
                      </span>
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="isPass" defaultChecked={move.isPass} />
                        Passe
                      </label>
                      <button type="submit" className="rounded bg-emerald-700 text-white px-3 py-1.5 text-sm">
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded border border-black/10 dark:border-white/20 px-3 py-1.5 text-sm"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        formAction={deleteActionBase.bind(null, move.id)}
                        className="rounded bg-brick hover:bg-brick/90 text-white px-3 py-1.5 text-xs font-medium transition-colors"
                      >
                        Supprimer
                      </button>
                    </form>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={move.id} className="border-b border-black/5 dark:border-white/5">
                <td className="py-1.5 pr-4">{move.turnNumber}</td>
                <td className="py-1.5 pr-4">{move.reference}</td>
                <td className="py-1.5 pr-4">{move.rack || "—"}</td>
                <td className="py-1.5 pr-4">{move.isPass ? "Passe" : move.word || "—"}</td>
                <td className="py-1.5 pr-4">{move.points}</td>
                <td className="py-1.5 pr-4">{move.isPass ? "Oui" : ""}</td>
                {canManage && (
                  <td className="py-1.5 pr-4">
                    <button
                      type="button"
                      onClick={() => setEditingId(move.id)}
                      className="text-xs text-emerald-700 dark:text-emerald-400 underline"
                    >
                      Modifier
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
          {moves.length === 0 && (
            <tr>
              <td colSpan={canManage ? 7 : 6} className="py-2 text-black/50 dark:text-white/50">
                Aucun coup de référence saisi.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
