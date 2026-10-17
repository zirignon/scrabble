import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, canRecordResults, STAFF_ROLES } from "@/lib/guards";
import {
  addReferenceMoveAction,
  deleteReferenceMoveAction,
  endGameAction,
  findReferenceMoveSolutionsAction,
  reopenGameAction,
  updateReferenceMoveAction,
} from "@/lib/actions/duplicate";
import {
  reconstructBoard,
  applyResolvedJokers,
  formatReference,
  getFreeAvertissementCount,
  getRythmeAlertSeconds,
  computeAvertissementCosts,
  computeSoloWinners,
  computeGameTop,
  computeLastReliquat,
  computeAvailableLetters,
  countStuckJokers,
  isGameOver,
  isJokerFormula,
  FRENCH_VOWELS,
  SOLO_BONUS_MIN_PLAYERS,
} from "@/lib/duplicate/board";
import { anonymizePlayersForGame } from "@/lib/duplicate/anonymize";
import { ArbitrationGridPanel } from "@/components/admin/ArbitrationGridPanel";

export default async function GameMovesPage({
  params,
}: {
  params: Promise<{ id: string; gameId: string }>;
}) {
  const { id, gameId } = await params;
  const session = await requireRole(STAFF_ROLES);

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      registrations: { include: { player: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!tournament || tournament.type !== "DUPLICATE") notFound();

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      moves: { orderBy: { turnNumber: "asc" } },
      results: true,
      referenceMoves: { orderBy: { turnNumber: "asc" } },
      resolvedJokers: true,
    },
  });
  if (!game || game.tournamentId !== tournament.id) notFound();

  const canManage = canManageTournament(session, tournament.organizerId);
  // Un arbitre explicitement assigné à ce tournoi (TournamentReferee) peut
  // aussi consulter cette page, pour y saisir les scores de la feuille de
  // partie (plus bas) — mais pas gérer la grille de référence ni le
  // chrono (ReferenceMoveNavigator/GameTimerControls ci-dessous), qui
  // restent gérés via canManage uniquement, inchangé. Voir le commentaire
  // équivalent dans page.tsx pour le garde lui-même : sans lui, n'importe
  // quel membre du staff pourrait consulter la saisie d'une partie tierce.
  const canEnterScores = await canRecordResults(session, tournament);
  if (!canEnterScores) notFound();
  const players = tournament.registrations.map((r) => r.player);
  const resultByPlayer = new Map(game.results.map((r) => [r.playerId, r]));
  // Un joker joué est résolu automatiquement dès la validation du tirage
  // du tour suivant (voir validateGameRackAction) : la grille affichée
  // reflète déjà cet état, sans contrôle manuel sur cette page.
  const board = applyResolvedJokers(reconstructBoard(game.referenceMoves), game.resolvedJokers);
  const addReferenceMoveBound = addReferenceMoveAction.bind(null, tournament.id, game.id);
  const updateReferenceMoveBound = updateReferenceMoveAction.bind(null, tournament.id, game.id);
  const deleteReferenceMoveBound = deleteReferenceMoveAction.bind(null, tournament.id, game.id);
  const findSolutionsBound = findReferenceMoveSolutionsAction.bind(null, tournament.id, game.id);
  const navigatorMoves = game.referenceMoves.map((move) => ({
    id: move.id,
    turnNumber: move.turnNumber,
    reference: formatReference(move.row, move.col, move.direction),
    rack: move.rack ?? "",
    word: move.word ?? "",
    points: move.points,
    isPass: move.isPass,
  }));

  // Joueurs affichés dans un ordre anonymisé pour la saisie des scores,
  // basé sur le classement général avant cette partie (le 1er du
  // classement devient "Joueur 1", etc.), afin que l'arbitre ne favorise
  // pas un joueur qu'il reconnaîtrait.
  const anonymizedPlayers = await anonymizePlayersForGame(tournament.id, game.number, players);
  const moveByTurnAndPlayer = new Map(
    game.moves.map((m) => [`${m.turnNumber}:${m.playerId}`, m])
  );
  const freeAvertissements = getFreeAvertissementCount(tournament.duplicateRythme);
  const avertissementCostMap = computeAvertissementCosts(game.moves, freeAvertissements);
  const soloWinners = computeSoloWinners(game.moves);
  const soloEligible = players.length > SOLO_BONUS_MIN_PLAYERS;
  const alertSeconds = getRythmeAlertSeconds(tournament.duplicateRythme);
  const top = computeGameTop(game.referenceMoves, game.top);
  // Sac épuisé (plus de voyelles ou plus de consonnes, reliquat en main
  // compris, voir isGameOver) : un nouveau tirage est alors refusé par
  // validateGameRackAction, indépendamment de cet affichage.
  const bagExhausted = isGameOver(game.referenceMoves, game.resolvedJokers);
  const endGameBound = endGameAction.bind(null, tournament.id, game.id);
  const reopenGameBound = reopenGameAction.bind(null, tournament.id, game.id);

  // Ligne de statut du sac affichée à l'arbitre (gauche de la grille) :
  // estimation du nombre de jetons encore disponibles pour les tirages à
  // venir, voir computeAvailableLetters/countStuckJokers (indicatif, le
  // logiciel ne simule pas le sac physique).
  const jokerFormula = isJokerFormula(tournament.duplicateFormula);
  const availableLetters = computeAvailableLetters(game.referenceMoves, game.resolvedJokers);
  let vowelsLeft = 0;
  let consonantsLeft = 0;
  for (const [letter, count] of Object.entries(availableLetters)) {
    if (count <= 0) continue;
    if (FRENCH_VOWELS.has(letter)) vowelsLeft += count;
    else consonantsLeft += count;
  }
  const jokersInPlay = jokerFormula
    ? Math.max(0, 2 - countStuckJokers(game.referenceMoves, game.resolvedJokers))
    : 0;
  const totalTokensLeft = vowelsLeft + consonantsLeft + jokersInPlay;
  const currentRackDisplay =
    game.pendingRack ?? computeLastReliquat(game.referenceMoves, tournament.duplicateFormula) ?? "";
  const maxTurn = navigatorMoves.length > 0 ? navigatorMoves[navigatorMoves.length - 1].turnNumber : 0;
  const bagStatusText =
    `Il reste ${totalTokensLeft} jeton${totalTokensLeft === 1 ? "" : "s"} dans le sac et le reliquat` +
    (jokerFormula ? `, dont ${jokersInPlay} joker${jokersInPlay === 1 ? "" : "s"}` : "") +
    `, ${consonantsLeft} consonne${consonantsLeft === 1 ? "" : "s"} et ${vowelsLeft} voyelle${vowelsLeft === 1 ? "" : "s"}.`;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/admin/tournois/${tournament.id}/parties`}
          className="text-sm text-black/60 dark:text-white/60 hover:underline"
        >
          ← Retour aux parties
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-navy dark:text-navy-light mt-1">
          Partie {game.number} — détail coup par coup
        </h1>
        <Link
          href={`/tournois/${tournament.slug}/affichage`}
          target="_blank"
          className="inline-block mt-2 rounded-md border border-black/10 dark:border-white/20 px-3 py-1.5 text-sm hover:bg-navy/[.04] hover:border-navy/20 dark:hover:bg-navy-light/[.08] dark:hover:border-navy-light/30 transition-colors"
        >
          Ouvrir l&apos;affichage grand écran ↗
        </Link>
        {top != null && (
          <p className="text-sm text-black/60 dark:text-white/60 mt-1">
            Top de la partie : {top}
            {game.referenceMoves.length > 0 && (
              <span className="text-black/50 dark:text-white/50">
                {" "}
                (cumul automatique des tops de chaque coup)
              </span>
            )}
          </p>
        )}

        {game.playedAt ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-moss/30 bg-moss/10 dark:bg-moss-light/10 px-3 py-2 text-sm">
            <span className="text-moss dark:text-moss-light font-medium">
              Partie terminée le {new Date(game.playedAt).toLocaleDateString("fr-FR")}
            </span>
            {canManage && (
              <form action={reopenGameBound}>
                <button type="submit" className="text-xs underline text-black/60 dark:text-white/60">
                  Rouvrir la partie
                </button>
              </form>
            )}
          </div>
        ) : (
          bagExhausted && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-brick/30 bg-brick/10 px-3 py-2 text-sm">
              <span className="text-brick font-medium">
                Le sac est épuisé (plus de voyelles ou plus de consonnes disponibles) : la
                partie peut se terminer, aucun nouveau tirage n&apos;est accepté.
              </span>
              {canManage && (
                <form action={endGameBound}>
                  <button
                    type="submit"
                    className="rounded bg-brick hover:bg-brick/90 text-white px-3 py-1 text-xs font-medium transition-colors"
                  >
                    Terminer la partie
                  </button>
                </form>
              )}
            </div>
          )
        )}
        {!game.playedAt && !bagExhausted && canManage && (
          <form action={endGameBound} className="mt-3">
            <button
              type="submit"
              className="text-xs underline text-black/50 dark:text-white/50"
              title="Clôture la partie avant l'épuisement du sac (abandon, arrêt anticipé...)"
            >
              Terminer la partie maintenant
            </button>
          </form>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Grille de référence (arbitre)</h2>

        <ArbitrationGridPanel
          board={board}
          rackDisplay={currentRackDisplay}
          bagStatusText={bagStatusText}
          game={game}
          referenceMoves={game.referenceMoves}
          canManage={canManage}
          canEnterScores={canEnterScores}
          alertSeconds={alertSeconds}
          tournamentId={tournament.id}
          duplicateFormula={tournament.duplicateFormula}
          locked={Boolean(game.playedAt) || bagExhausted}
          addReferenceMoveAction={addReferenceMoveBound}
          findSolutionsAction={findSolutionsBound}
          turnNumber={maxTurn + 1}
          pendingRack={game.pendingRack}
          historyMoves={navigatorMoves}
          updateReferenceMoveAction={updateReferenceMoveBound}
          deleteReferenceMoveAction={deleteReferenceMoveBound}
          anonymizedPlayers={anonymizedPlayers}
          moveByTurnAndPlayer={moveByTurnAndPlayer}
          avertissementCostMap={avertissementCostMap}
          soloWinners={soloWinners}
          soloEligible={soloEligible}
          resultByPlayer={resultByPlayer}
        />
      </section>
    </div>
  );
}
