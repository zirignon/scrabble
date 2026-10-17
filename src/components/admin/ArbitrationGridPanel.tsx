"use client";

import { useState } from "react";
import { ScrabbleGrid } from "@/components/ScrabbleGrid";
import { RackTiles } from "@/components/admin/RackTiles";
import { GameTimerControls } from "@/components/admin/GameTimerControls";
import { ReferenceMoveSolverForm } from "@/components/admin/ReferenceMoveSolverForm";
import { ReferenceMoveHistory, type NavigatorMove } from "@/components/admin/ReferenceMoveHistory";
import { previewSolutionOnBoard, type BoardCell } from "@/lib/duplicate/board";
import type { SolverSolution } from "@/lib/duplicate/solver";
import type { Game, ReferenceMove } from "@prisma/client";

// Zone "Grille de référence" de la page d'arbitrage : grille + tirage en
// cours + statut du sac à gauche, contrôles du tour + saisie du coup de
// référence + historique à droite. Rassemblés dans un seul composant
// client (plutôt que répartis entre la page serveur et plusieurs
// composants indépendants) pour que l'aperçu d'une solution survolée dans
// ReferenceMoveSolverForm puisse s'afficher directement sur LA grille de
// référence elle-même, pas sur une mini grille séparée : c'est un état
// purement local au navigateur de l'arbitre (jamais enregistré ni
// diffusé sur l'affichage grand écran, qui ne lit que les coups de
// référence réellement validés en base).
export function ArbitrationGridPanel({
  board,
  rackDisplay,
  bagStatusText,
  game,
  referenceMoves,
  canManage,
  alertSeconds,
  tournamentId,
  duplicateFormula,
  locked,
  addReferenceMoveAction,
  findSolutionsAction,
  turnNumber,
  pendingRack,
  historyMoves,
  updateReferenceMoveAction,
  deleteReferenceMoveAction,
}: {
  board: (BoardCell | null)[][];
  rackDisplay: string;
  bagStatusText: string;
  game: Game;
  referenceMoves: ReferenceMove[];
  canManage: boolean;
  alertSeconds: number;
  tournamentId: string;
  duplicateFormula: string | null;
  locked: boolean;
  addReferenceMoveAction: (formData: FormData) => Promise<void>;
  findSolutionsAction: (rack: string) => Promise<SolverSolution[]>;
  turnNumber: number;
  pendingRack: string | null;
  historyMoves: NavigatorMove[];
  updateReferenceMoveAction: (moveId: string, formData: FormData) => Promise<void>;
  deleteReferenceMoveAction: (moveId: string) => Promise<void>;
}) {
  const [previewed, setPreviewed] = useState<SolverSolution | null>(null);
  const preview = previewed ? previewSolutionOnBoard(board, previewed) : null;

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="w-full sm:w-auto shrink-0 flex flex-col gap-3">
        <div className="overflow-auto">
          <ScrabbleGrid grid={preview?.grid ?? board} previewCells={preview?.previewCells} cellSize={26} />
        </div>
        <div>
          <p className="text-xs text-black/50 dark:text-white/50 mb-1">Tirage en cours</p>
          <RackTiles rack={rackDisplay} />
        </div>
        <p className="text-xs text-black/50 dark:text-white/50">{bagStatusText}</p>
      </div>

      <div className="w-full min-w-0 sm:w-auto sm:flex-1 sm:min-w-[420px] flex flex-col gap-4">
        <GameTimerControls
          game={game}
          referenceMoves={referenceMoves}
          canManage={canManage}
          alertSeconds={alertSeconds}
          tournamentId={tournamentId}
          duplicateFormula={duplicateFormula}
          locked={locked}
        />

        {canManage && (
          <ReferenceMoveSolverForm
            // Remonte le formulaire (et réinitialise son état local) dès
            // que le tirage validé par l'arbitre change, pour que le
            // champ tirage reste synchronisé sans ressaisie.
            key={`${turnNumber}:${pendingRack ?? ""}`}
            addAction={addReferenceMoveAction}
            findSolutions={findSolutionsAction}
            onPreviewChange={setPreviewed}
            turnNumber={turnNumber}
            initialRack={pendingRack ?? ""}
          />
        )}

        <ReferenceMoveHistory
          moves={historyMoves}
          canManage={canManage}
          updateActionBase={updateReferenceMoveAction}
          deleteActionBase={deleteReferenceMoveAction}
        />
      </div>
    </div>
  );
}
