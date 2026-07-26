import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import {
  addMoveAction,
  addReferenceMoveAction,
  deleteMoveAction,
  deleteReferenceMoveAction,
  findReferenceMoveSolutionsAction,
  updateMoveAction,
  updateReferenceMoveAction,
} from "@/lib/actions/duplicate";
import { reconstructBoard, formatReference, getFreeAvertissementCount } from "@/lib/duplicate/board";
import { ScrabbleGrid } from "@/components/ScrabbleGrid";
import { ReferenceMoveNavigator } from "@/components/admin/ReferenceMoveNavigator";
import { GameTimerControls } from "@/components/admin/GameTimerControls";

const penaltyLabel: Record<string, string> = {
  AVERTISSEMENT: "Avertissement (A)",
  PENALITE: "Pénalité -5 (P)",
  ZERO: "Zéro (Z)",
};

const penaltyShort: Record<string, string> = {
  AVERTISSEMENT: "A",
  PENALITE: "P",
  ZERO: "Z",
};

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

        <p className="text-xs text-black/50 dark:text-white/50">
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
      </section>

      <p className="text-xs text-black/50 dark:text-white/50 max-w-3xl">
        Pénalité d&apos;arbitrage sur un coup : l&apos;avertissement (A) n&apos;a
        pas d&apos;effet chiffré direct, mais au-delà des{" "}
        {getFreeAvertissementCount(tournament.duplicateFormula)} avertissements
        gratuits de la partie (pour cette formule), chaque avertissement
        supplémentaire coûte 5 points ; la pénalité (P) retire 5 points
        immédiatement ; le zéro (Z) ramène les points du coup à 0. La
        pénalité totale de la partie (colonne Pénalité de la fiche joueur)
        est recalculée automatiquement à partir de ces marques.
      </p>

      {players.map((player) => {
        const moves = game.moves.filter((m) => m.playerId === player.id);
        const result = resultByPlayer.get(player.id);
        const total = moves.reduce((sum, m) => sum + m.points, 0);
        const addMoveBound = addMoveAction.bind(null, tournament.id, game.id, player.id);
        const freeAvertissements = getFreeAvertissementCount(tournament.duplicateFormula);
        const avertissementCount = moves.filter((m) => m.penaltyType === "AVERTISSEMENT").length;
        const penaliteCount = moves.filter((m) => m.penaltyType === "PENALITE").length;

        return (
          <section key={player.id} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              {player.firstName} {player.lastName}
              <span className="ml-2 text-sm font-normal text-black/60 dark:text-white/60">
                Total : {total}
                {result && result.penalty > 0 ? ` · Pénalité : -${result.penalty}` : ""}
                {avertissementCount > 0
                  ? ` · Avertissements : ${avertissementCount} (${freeAvertissements} gratuits)`
                  : ""}
                {penaliteCount > 0 ? ` · Pénalités posées : ${penaliteCount}` : ""}
              </span>
            </h2>

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pr-4">Coup</th>
                  <th className="py-2 pr-4">Tirage</th>
                  <th className="py-2 pr-4">Mot joué</th>
                  <th className="py-2 pr-4">Points</th>
                  <th className="py-2 pr-4">Top</th>
                  <th className="py-2 pr-4">Passe</th>
                  <th className="py-2 pr-4">Pénalité</th>
                  {canManage && <th className="py-2 pr-4"></th>}
                </tr>
              </thead>
              <tbody>
                {moves.map((move) => (
                  <tr key={move.id} className="border-b border-black/5 dark:border-white/5">
                    {canManage ? (
                      <td colSpan={8} className="py-1.5">
                        <form
                          action={updateMoveAction.bind(
                            null,
                            tournament.id,
                            game.id,
                            move.id
                          )}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <span className="w-10 text-black/60 dark:text-white/60">
                            #{move.turnNumber}
                          </span>
                          <input
                            type="text"
                            name="rack"
                            defaultValue={move.rack ?? ""}
                            placeholder="Tirage"
                            className="w-24 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent uppercase"
                          />
                          <input
                            type="text"
                            name="word"
                            defaultValue={move.word ?? ""}
                            placeholder="Mot joué"
                            className="w-32 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent uppercase"
                          />
                          <input
                            type="number"
                            name="points"
                            defaultValue={move.points}
                            className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
                          />
                          <input
                            type="number"
                            name="top"
                            defaultValue={move.top ?? ""}
                            placeholder="Top"
                            className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
                          />
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              name="isPass"
                              defaultChecked={move.isPass}
                            />
                            Passe
                          </label>
                          <select
                            name="penaltyType"
                            defaultValue={move.penaltyType ?? ""}
                            className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-xs"
                          >
                            <option value="">Aucune pénalité</option>
                            {Object.entries(penaltyLabel).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded bg-emerald-700 text-white px-2 py-1 text-xs"
                          >
                            OK
                          </button>
                          <button
                            type="submit"
                            formAction={deleteMoveAction.bind(
                              null,
                              tournament.id,
                              game.id,
                              move.id
                            )}
                            className="rounded border border-red-600 text-red-600 px-2 py-1 text-xs"
                          >
                            Supprimer
                          </button>
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className="py-1.5 pr-4">{move.turnNumber}</td>
                        <td className="py-1.5 pr-4">{move.rack ?? "—"}</td>
                        <td className="py-1.5 pr-4">
                          {move.isPass ? "Passe" : move.word ?? "—"}
                        </td>
                        <td className="py-1.5 pr-4">{move.points}</td>
                        <td className="py-1.5 pr-4">{move.top ?? "—"}</td>
                        <td className="py-1.5 pr-4">{move.isPass ? "Oui" : ""}</td>
                        <td className="py-1.5 pr-4">
                          {move.penaltyType ? penaltyShort[move.penaltyType] : "—"}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {moves.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-2 text-black/50 dark:text-white/50">
                      Aucun coup saisi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {canManage && (
              <form action={addMoveBound} className="flex flex-wrap items-center gap-2">
                <span className="w-10 text-black/60 dark:text-white/60 text-sm">
                  #{moves.length + 1}
                </span>
                <input
                  type="text"
                  name="rack"
                  placeholder="Tirage"
                  className="w-24 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm uppercase"
                />
                <input
                  type="text"
                  name="word"
                  placeholder="Mot joué"
                  className="w-32 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm uppercase"
                />
                <input
                  type="number"
                  name="points"
                  placeholder="Points"
                  className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
                />
                <input
                  type="number"
                  name="top"
                  placeholder="Top"
                  className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
                />
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="isPass" />
                  Passe
                </label>
                <select
                  name="penaltyType"
                  defaultValue=""
                  className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-xs"
                >
                  <option value="">Aucune pénalité</option>
                  {Object.entries(penaltyLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded border border-black/10 dark:border-white/20 px-3 py-1.5 text-sm"
                >
                  + Coup
                </button>
              </form>
            )}
          </section>
        );
      })}

      {players.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          Aucun joueur inscrit pour cette partie.
        </p>
      )}
    </div>
  );
}
