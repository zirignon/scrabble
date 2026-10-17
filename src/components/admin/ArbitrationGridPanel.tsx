"use client";

import { useState } from "react";
import { ScrabbleGrid } from "@/components/ScrabbleGrid";
import { RackTiles } from "@/components/admin/RackTiles";
import { GameTimerControls } from "@/components/admin/GameTimerControls";
import { ReferenceMoveSolverForm } from "@/components/admin/ReferenceMoveSolverForm";
import { ReferenceMoveHistory, type NavigatorMove } from "@/components/admin/ReferenceMoveHistory";
import { PlayerScoresTable } from "@/components/admin/PlayerScoresTable";
import { previewSolutionOnBoard, type BoardCell } from "@/lib/duplicate/board";
import type { SolverSolution } from "@/lib/duplicate/solver";
import type { DuplicateMove, DuplicateResult, Game, Player, ReferenceMove } from "@prisma/client";

// Zone "Grille de référence" + feuille de partie de la page d'arbitrage :
// grille + tirage en cours + statut du sac à gauche, contrôles du tour +
// saisie du coup de référence + historique + scores des joueurs à droite.
// Rassemblés dans un seul composant client (plutôt que répartis entre la
// page serveur et plusieurs composants indépendants) pour deux raisons :
// 1. l'aperçu d'une solution survolée dans ReferenceMoveSolverForm peut
//    s'afficher directement sur LA grille de référence elle-même, pas sur
//    une mini grille séparée — état purement local au navigateur de
//    l'arbitre, jamais enregistré ni diffusé sur l'affichage grand écran ;
// 2. la grille (colonne de gauche) reste épinglée à l'écran (position
//    sticky) pendant que l'arbitre fait défiler la feuille de scores à
//    droite, même sur une partie à de nombreux coups — l'épinglage CSS ne
//    fonctionne que si la grille et tout le contenu à faire défiler (y
//    compris la feuille de scores, auparavant une section à part plus bas
//    sur la page) partagent un même conteneur parent.
export function ArbitrationGridPanel({
  board,
  rackDisplay,
  bagStatusText,
  game,
  referenceMoves,
  canManage,
  canEnterScores,
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
  anonymizedPlayers,
  moveByTurnAndPlayer,
  avertissementCostMap,
  soloWinners,
  soloEligible,
  resultByPlayer,
}: {
  board: (BoardCell | null)[][];
  rackDisplay: string;
  bagStatusText: string;
  game: Game;
  referenceMoves: ReferenceMove[];
  canManage: boolean;
  canEnterScores: boolean;
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
  anonymizedPlayers: { player: Player; label: string }[];
  moveByTurnAndPlayer: Map<string, DuplicateMove>;
  avertissementCostMap: Map<string, boolean>;
  soloWinners: Map<number, string>;
  soloEligible: boolean;
  resultByPlayer: Map<string, DuplicateResult>;
}) {
  const [previewed, setPreviewed] = useState<SolverSolution | null>(null);
  const preview = previewed ? previewSolutionOnBoard(board, previewed) : null;
  // Coup en cours de modification (déclenché depuis ReferenceMoveHistory,
  // "Modifier") : le panneau ReferenceMoveSolverForm, normalement dédié à
  // l'ajout du prochain coup, bascule alors en mode édition de CE coup —
  // seule zone d'édition de la page, jamais un formulaire dans le tableau
  // d'historique lui-même.
  const [editingMove, setEditingMove] = useState<NavigatorMove | null>(null);
  // L'historique complet n'est plus affiché en permanence (trop de coups
  // au fil d'une partie alourdissait la page) : un bouton "Modifier"
  // sous "+ Coup de référence" le révèle à la demande (hauteur limitée,
  // défilement au-delà), le temps de choisir quel coup corriger ; il se
  // masque à nouveau dès qu'un coup est choisi ou que l'édition est
  // annulée.
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="flex flex-wrap items-start gap-6">
      {/* sm:sticky + un top sous la barre de navigation du site (elle-même
          sticky top-0) : la grille reste visible à l'écran même quand la
          feuille de scores, à droite, est bien plus longue qu'elle et
          qu'on la fait défiler. */}
      <div className="w-full sm:w-auto shrink-0 flex flex-col gap-3 sm:sticky sm:top-20 sm:max-h-[calc(100vh-5.5rem)] sm:overflow-y-auto">
        <div>
          <p className="text-xs text-black/50 dark:text-white/50 mb-1">Tirage en cours</p>
          <RackTiles rack={rackDisplay} />
        </div>
        <div className="overflow-auto">
          <ScrabbleGrid grid={preview?.grid ?? board} previewCells={preview?.previewCells} cellSize={26} />
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
            // que le tirage validé par l'arbitre change, ou dès qu'on
            // bascule vers/hors d'une modification, pour que les champs
            // restent synchronisés sans ressaisie ni état résiduel.
            key={editingMove ? `edit:${editingMove.id}` : `add:${turnNumber}:${pendingRack ?? ""}`}
            addAction={addReferenceMoveAction}
            updateAction={updateReferenceMoveAction}
            deleteAction={deleteReferenceMoveAction}
            findSolutions={findSolutionsAction}
            onPreviewChange={setPreviewed}
            onCancelEdit={() => {
              setEditingMove(null);
              setShowHistory(false);
            }}
            editingMove={editingMove}
            turnNumber={editingMove ? editingMove.turnNumber : turnNumber}
            initialRack={editingMove ? editingMove.rack : pendingRack ?? ""}
            historyVisible={showHistory}
            onToggleHistory={() => setShowHistory((v) => !v)}
          />
        )}

        {canManage && showHistory && !editingMove && (
          <ReferenceMoveHistory
            moves={historyMoves}
            canManage={canManage}
            editingMoveId={null}
            onEdit={(move) => {
              setEditingMove(move);
              setShowHistory(false);
            }}
          />
        )}

        {!canManage && (
          <ReferenceMoveHistory moves={historyMoves} canManage={false} />
        )}

        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold">Scores des joueurs</h2>
          <PlayerScoresTable
            tournamentId={tournamentId}
            gameId={game.id}
            anonymizedPlayers={anonymizedPlayers}
            referenceMoves={referenceMoves}
            moveByTurnAndPlayer={moveByTurnAndPlayer}
            avertissementCostMap={avertissementCostMap}
            soloWinners={soloWinners}
            soloEligible={soloEligible}
            canEnterScores={canEnterScores}
            resultByPlayer={resultByPlayer}
          />
        </div>
      </div>
    </div>
  );
}
