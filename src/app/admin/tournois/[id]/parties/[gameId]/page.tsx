import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import {
  addReferenceMoveAction,
  deleteReferenceMoveAction,
  findReferenceMoveSolutionsAction,
  saveTurnScoresAction,
  updateReferenceMoveAction,
} from "@/lib/actions/duplicate";
import {
  reconstructBoard,
  formatReference,
  getFreeAvertissementCount,
  computeAvertissementCosts,
  computeSoloWinners,
  SOLO_BONUS_MIN_PLAYERS,
  SOLO_BONUS_POINTS,
} from "@/lib/duplicate/board";
import { anonymizePlayersForGame } from "@/lib/duplicate/anonymize";
import { ScrabbleGrid } from "@/components/ScrabbleGrid";
import { ReferenceMoveNavigator } from "@/components/admin/ReferenceMoveNavigator";
import { GameTimerControls } from "@/components/admin/GameTimerControls";

// Étiquette + info d'affichage pour un coup : la marque de pénalité (indique
// si l'avertissement est encore gratuit ou s'il coûte 5 points comme la
// pénalité) et la bonification solo (règlement FISF §3.5), pour calculer le
// net à afficher sur ce coup précis (le stockage de DuplicateMove.points
// reste le score brut du mot ; les ajustements ne sont réellement appliqués
// qu'au total de la partie). Une pénalité ne peut jamais rendre le net
// négatif (§5.6) — déjà empêché à la saisie, mais on s'en protège ici aussi.
function moveDisplayInfo(
  pm: { points: number; penaltyType: string | null } | undefined,
  costsFive: boolean,
  isSolo: boolean,
  soloEligible: boolean
) {
  const penaltyType = pm?.penaltyType ?? null;
  const badgeLabel =
    penaltyType === "AVERTISSEMENT" ? "A" : penaltyType === "PENALITE" ? "P" : penaltyType === "ZERO" ? "Z" : null;
  const isFreeAvertissement = penaltyType === "AVERTISSEMENT" && !costsFive;
  const penaltyDeduction =
    penaltyType === "PENALITE" || (penaltyType === "AVERTISSEMENT" && costsFive) ? 5 : 0;
  const soloBonus = isSolo && soloEligible ? SOLO_BONUS_POINTS : 0;
  const net =
    pm && (penaltyDeduction > 0 || soloBonus > 0)
      ? Math.max(0, pm.points - penaltyDeduction) + soloBonus
      : null;
  return { badgeLabel, isFreeAvertissement, isSolo, soloBonus, net };
}

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
    },
  });
  if (!game || game.tournamentId !== tournament.id) notFound();

  const canManage = canManageTournament(session, tournament.organizerId);
  const players = tournament.registrations.map((r) => r.player);
  const resultByPlayer = new Map(game.results.map((r) => [r.playerId, r]));
  const board = reconstructBoard(game.referenceMoves);
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
  const freeAvertissements = getFreeAvertissementCount(tournament.duplicateFormula);
  const avertissementCostMap = computeAvertissementCosts(game.moves, freeAvertissements);
  const soloWinners = computeSoloWinners(game.moves);
  const soloEligible = players.length >= SOLO_BONUS_MIN_PLAYERS;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/admin/tournois/${tournament.id}/parties`}
          className="text-sm text-black/60 dark:text-white/60 hover:underline"
        >
          ← Retour aux parties
        </Link>
        <h1 className="text-2xl font-semibold mt-1">
          Partie {game.number} — détail coup par coup
        </h1>
        <Link
          href={`/tournois/${tournament.slug}/affichage`}
          target="_blank"
          className="inline-block mt-2 rounded-md border border-black/10 dark:border-white/20 px-3 py-1.5 text-sm hover:bg-black/[.02] dark:hover:bg-white/[.04]"
        >
          Ouvrir l&apos;affichage grand écran ↗
        </Link>
        {game.top != null && (
          <p className="text-sm text-black/60 dark:text-white/60 mt-1">
            Top de la partie : {game.top}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Grille de référence (arbitre)</h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          Le coup joué par l&apos;arbitre à chaque tour, contre lequel les
          propositions des joueurs sont comparées. C&apos;est cette grille qui
          est projetée sur l&apos;affichage grand écran.
        </p>

        <div className="flex flex-wrap items-start gap-6">
          <div className="overflow-auto">
            <ScrabbleGrid grid={board} cellSize={26} />
          </div>

          <div className="flex-1 min-w-[420px] flex flex-col gap-3">
            {canManage ? (
              <ReferenceMoveNavigator
                moves={navigatorMoves}
                addAction={addReferenceMoveBound}
                updateActionBase={updateReferenceMoveBound}
                deleteActionBase={deleteReferenceMoveBound}
                findSolutions={findSolutionsBound}
                initialRack={game.pendingRack ?? ""}
              />
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b border-black/10 dark:border-white/10">
                    <th className="py-2 pr-4">Coup</th>
                    <th className="py-2 pr-4">Référence</th>
                    <th className="py-2 pr-4">Tirage</th>
                    <th className="py-2 pr-4">Mot</th>
                    <th className="py-2 pr-4">Points</th>
                    <th className="py-2 pr-4">Passe</th>
                  </tr>
                </thead>
                <tbody>
                  {navigatorMoves.map((move) => (
                    <tr key={move.id} className="border-b border-black/5 dark:border-white/5">
                      <td className="py-1.5 pr-4">{move.turnNumber}</td>
                      <td className="py-1.5 pr-4">{move.reference}</td>
                      <td className="py-1.5 pr-4">{move.rack || "—"}</td>
                      <td className="py-1.5 pr-4">{move.isPass ? "Passe" : move.word || "—"}</td>
                      <td className="py-1.5 pr-4">{move.points}</td>
                      <td className="py-1.5 pr-4">{move.isPass ? "Oui" : ""}</td>
                    </tr>
                  ))}
                  {navigatorMoves.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-2 text-black/50 dark:text-white/50">
                        Aucun coup de référence saisi.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            <GameTimerControls
              game={game}
              referenceMoves={game.referenceMoves}
              canManage={canManage}
              tournamentId={tournament.id}
            />
          </div>
        </div>

        <details className="text-xs text-black/50 dark:text-white/50">
          <summary className="cursor-pointer select-none hover:text-black/70 dark:hover:text-white/70">
            Aide : notation des coups et du tirage
          </summary>
          <p className="mt-1">
            Référence : lettre puis chiffre pour un mot horizontal (ex. H4),
            chiffre puis lettre pour un mot vertical (ex. 4H). Une lettre en
            minuscule dans le mot joué est une lettre blanche (joker) : elle
            vaut 0 point, et s&apos;affiche sur la grille sans coefficient.
            Le score est calculé automatiquement (valeur
            des lettres, cases bonus, mots croisés, prime de Scrabble selon la
            formule du tournoi). Dans le tirage, notez une lettre blanche en
            main avec un point d&apos;interrogation (?) : c&apos;est ainsi
            qu&apos;elle s&apos;affiche sur l&apos;affichage grand écran. Le
            tirage est projeté automatiquement dès qu&apos;il est saisi ici, et
            n&apos;affiche plus que le reliquat (lettres non jouées) une fois
            le mot renseigné. Le bouton « Solutions » cherche, à partir du
            tirage saisi et du dictionnaire importé (page Dictionnaire), tous
            les mots jouables sur la grille actuelle, triés par points ;
            cliquez sur « Choisir » pour préremplir la référence et le mot.
            Le sélecteur « Coup » fait apparaître les champs du tour choisi
            pour le corriger ou le supprimer, sans afficher tout
            l&apos;historique en même temps.
          </p>
        </details>
      </section>

      <details className="text-xs text-black/50 dark:text-white/50 max-w-3xl">
        <summary className="cursor-pointer select-none hover:text-black/70 dark:hover:text-white/70">
          Aide : pénalités d&apos;arbitrage
        </summary>
        <p className="mt-1">
          L&apos;avertissement (A) n&apos;a
          pas d&apos;effet chiffré direct, mais au-delà des{" "}
          {freeAvertissements} avertissements
          gratuits de la partie (5 en Blitz uniquement, 3 dans toutes les
          autres formules y compris les formules originales), chaque
          avertissement supplémentaire coûte 5 points ; la pénalité (P)
          retire 5 points immédiatement —
          sauf si le coup rapporte 4 points ou moins, auquel cas c&apos;est
          obligatoirement un zéro (Z) plutôt qu&apos;une pénalité, pour ne
          jamais aboutir à un score négatif (règlement §5.6) ; le zéro (Z)
          ramène les points du coup à 0. La pénalité totale de la partie
          (colonne Pénalité de la fiche joueur) est recalculée
          automatiquement à partir de ces marques ; le badge affiché sur un
          coup indique la marque appliquée et, le cas échéant, le total net
          après -5. Pour corriger une pénalité ou un avertissement saisi par
          erreur, changez simplement la valeur du sélecteur sur le coup
          concerné et validez à nouveau la ligne.
        </p>
        <p className="mt-2">
          Bonification solo (règlement §3.5) : le joueur seul à avoir le
          meilleur score sur un coup donné (avant pénalité) reçoit le badge
          « Solo ». À partir de {SOLO_BONUS_MIN_PLAYERS} joueurs inscrits au
          tournoi, ce solo rapporte {SOLO_BONUS_POINTS} points de
          bonification, ajoutés automatiquement au score de la partie ; en
          dessous de ce seuil, le solo est signalé mais ne rapporte aucun
          point.
        </p>
      </details>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Scores des joueurs</h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          Les joueurs sont affichés dans un ordre anonymisé propre à cette
          partie (« Joueur 1 », « Joueur 2 »...), pour que l&apos;arbitre ne
          puisse pas favoriser quelqu&apos;un qu&apos;il reconnaîtrait à sa
          position habituelle. Une ligne par tour ; chaque ligne se valide
          indépendamment.
        </p>

        {players.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">
            Aucun joueur inscrit pour cette partie.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pr-3">Coup</th>
                  <th className="py-2 pr-4">Référence</th>
                  {anonymizedPlayers.map(({ player, label }) => (
                    <th key={player.id} className="py-2 px-2 text-center">
                      {label}
                    </th>
                  ))}
                  {canManage && <th className="py-2 pr-2"></th>}
                </tr>
              </thead>
              <tbody>
                {game.referenceMoves.map((move) => {
                  const formId = `turn-${move.turnNumber}`;
                  return (
                    <tr key={move.turnNumber} className="border-b border-black/5 dark:border-white/5">
                      <td className="py-1.5 pr-3 text-black/60 dark:text-white/60">
                        {move.turnNumber}
                      </td>
                      <td className="py-1.5 pr-4 whitespace-nowrap">
                        <span className="font-medium">
                          {formatReference(move.row, move.col, move.direction)}
                        </span>{" "}
                        {move.isPass ? "Passe" : move.word ?? "—"}{" "}
                        <span className="text-black/50 dark:text-white/50">
                          ({move.points} pts)
                        </span>
                      </td>
                      {anonymizedPlayers.map(({ player }) => {
                        const pm = moveByTurnAndPlayer.get(`${move.turnNumber}:${player.id}`);
                        const costsFive =
                          avertissementCostMap.get(`${move.turnNumber}:${player.id}`) ?? false;
                        const isSolo = soloWinners.get(move.turnNumber) === player.id;
                        const info = moveDisplayInfo(pm, costsFive, isSolo, soloEligible);
                        const penaltyBadge = info.badgeLabel && (
                          <span
                            title={
                              info.badgeLabel === "A"
                                ? info.isFreeAvertissement
                                  ? "Avertissement (encore gratuit)"
                                  : "Avertissement (hors quota gratuit, -5)"
                                : info.badgeLabel === "P"
                                ? "Pénalité, -5"
                                : "Zéro : points ramenés à 0"
                            }
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              info.isFreeAvertissement
                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                                : "bg-red-500/20 text-red-700 dark:text-red-400"
                            }`}
                          >
                            {info.badgeLabel}
                            {info.isFreeAvertissement ? " libre" : info.badgeLabel !== "Z" ? " −5" : ""}
                          </span>
                        );
                        const soloBadge = info.isSolo && (
                          <span
                            title={
                              soloEligible
                                ? "Solo : seul meilleur score du coup, +10 points (règlement §3.5)"
                                : "Solo : seul meilleur score du coup (pas de bonification, moins de 16 joueurs inscrits)"
                            }
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-400/25 text-amber-800 dark:text-amber-300"
                          >
                            Solo{info.soloBonus > 0 ? " +10" : ""}
                          </span>
                        );
                        const netLine = info.net !== null && (
                          <span className="text-[10px] text-black/50 dark:text-white/50">
                            net {info.net}
                          </span>
                        );
                        return (
                          <td key={player.id} className="py-1 px-2 text-center">
                            {canManage ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <input
                                  form={formId}
                                  type="number"
                                  name={`score_${player.id}`}
                                  defaultValue={pm?.points ?? ""}
                                  max={move.points}
                                  title={`Le top de ce coup est ${move.points} points : aucun score ne peut le dépasser.`}
                                  placeholder="—"
                                  className="w-14 rounded border border-black/10 dark:border-white/20 px-1 py-0.5 text-center bg-transparent text-sm"
                                />
                                <select
                                  form={formId}
                                  name={`penalty_${player.id}`}
                                  defaultValue={pm?.penaltyType ?? ""}
                                  className="w-14 rounded border border-black/10 dark:border-white/20 bg-transparent text-[10px]"
                                >
                                  <option value="">—</option>
                                  <option value="AVERTISSEMENT">A</option>
                                  <option value="PENALITE">P</option>
                                  <option value="ZERO">Z</option>
                                </select>
                                {penaltyBadge}
                                {soloBadge}
                                {netLine}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-0.5">
                                <span>{pm?.points ?? "—"}</span>
                                {penaltyBadge}
                                {soloBadge}
                                {netLine}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      {canManage && (
                        <td className="py-1.5 pr-2">
                          <form
                            id={formId}
                            action={saveTurnScoresAction.bind(null, tournament.id, game.id, move.turnNumber)}
                          >
                            <button
                              type="submit"
                              className="rounded bg-emerald-700 text-white px-2 py-1 text-xs whitespace-nowrap"
                            >
                              Valider
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {game.referenceMoves.length === 0 && (
                  <tr>
                    <td
                      colSpan={2 + anonymizedPlayers.length + (canManage ? 1 : 0)}
                      className="py-2 text-black/50 dark:text-white/50"
                    >
                      Aucun coup de référence saisi pour l&apos;instant.
                    </td>
                  </tr>
                )}
              </tbody>
              {game.referenceMoves.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-black/20 dark:border-white/20 font-semibold">
                    <td colSpan={2} className="py-2 pr-4">
                      Total (net)
                    </td>
                    {anonymizedPlayers.map(({ player }) => {
                      const result = resultByPlayer.get(player.id);
                      const net = result ? result.score - result.penalty : null;
                      return (
                        <td key={player.id} className="py-2 px-2 text-center">
                          {net ?? "—"}
                        </td>
                      );
                    })}
                    {canManage && <td></td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
