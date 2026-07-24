import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import {
  addMoveAction,
  addReferenceMoveAction,
  deleteMoveAction,
  deleteReferenceMoveAction,
  updateMoveAction,
  updateReferenceMoveAction,
} from "@/lib/actions/duplicate";
import { reconstructBoard, formatReference } from "@/lib/duplicate/board";
import { ScrabbleGrid } from "@/components/ScrabbleGrid";

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

        <div className="overflow-auto">
          <ScrabbleGrid grid={board} cellSize={26} />
        </div>

        <table className="w-full text-sm border-collapse max-w-3xl">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="py-2 pr-4">Coup</th>
              <th className="py-2 pr-4">Référence</th>
              <th className="py-2 pr-4">Mot</th>
              <th className="py-2 pr-4">Points</th>
              <th className="py-2 pr-4">Passe</th>
              {canManage && <th className="py-2 pr-4"></th>}
            </tr>
          </thead>
          <tbody>
            {game.referenceMoves.map((move) => (
              <tr key={move.id} className="border-b border-black/5 dark:border-white/5">
                {canManage ? (
                  <td colSpan={6} className="py-1.5">
                    <form
                      action={updateReferenceMoveAction.bind(
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
                        name="reference"
                        defaultValue={formatReference(move.row, move.col, move.direction)}
                        placeholder="Ex. H4 / 4H"
                        className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent uppercase"
                      />
                      <input
                        type="text"
                        name="word"
                        defaultValue={move.word ?? ""}
                        placeholder="Mot joué"
                        className="w-32 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
                      />
                      <span className="w-16 text-sm text-black/60 dark:text-white/60">
                        {move.points} pts
                      </span>
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="isPass" defaultChecked={move.isPass} />
                        Passe
                      </label>
                      <button
                        type="submit"
                        className="rounded bg-emerald-700 text-white px-2 py-1 text-xs"
                      >
                        OK
                      </button>
                      <button
                        type="submit"
                        formAction={deleteReferenceMoveAction.bind(
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
                    <td className="py-1.5 pr-4">
                      {formatReference(move.row, move.col, move.direction)}
                    </td>
                    <td className="py-1.5 pr-4">{move.isPass ? "Passe" : move.word ?? "—"}</td>
                    <td className="py-1.5 pr-4">{move.points}</td>
                    <td className="py-1.5 pr-4">{move.isPass ? "Oui" : ""}</td>
                  </>
                )}
              </tr>
            ))}
            {game.referenceMoves.length === 0 && (
              <tr>
                <td colSpan={6} className="py-2 text-black/50 dark:text-white/50">
                  Aucun coup de référence saisi.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {canManage && (
          <form action={addReferenceMoveBound} className="flex flex-wrap items-center gap-2">
            <span className="w-10 text-black/60 dark:text-white/60 text-sm">
              #{game.referenceMoves.length + 1}
            </span>
            <input
              type="text"
              name="reference"
              placeholder="Ex. H4 / 4H"
              className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm uppercase"
            />
            <input
              type="text"
              name="word"
              placeholder="Mot joué"
              className="w-32 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
            />
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" name="isPass" />
              Passe
            </label>
            <button
              type="submit"
              className="rounded border border-black/10 dark:border-white/20 px-3 py-1.5 text-sm"
            >
              + Coup de référence
            </button>
          </form>
        )}
        <p className="text-xs text-black/50 dark:text-white/50">
          Référence : lettre puis chiffre pour un mot horizontal (ex. H4),
          chiffre puis lettre pour un mot vertical (ex. 4H). Une lettre en
          minuscule est une lettre blanche (joker) : elle vaut 0 point. Le
          score est calculé automatiquement (valeur des lettres, cases
          bonus, mots croisés, prime de Scrabble selon la formule du
          tournoi).
        </p>
      </section>

      {players.map((player) => {
        const moves = game.moves.filter((m) => m.playerId === player.id);
        const result = resultByPlayer.get(player.id);
        const total = moves.reduce((sum, m) => sum + m.points, 0);
        const addMoveBound = addMoveAction.bind(null, tournament.id, game.id, player.id);

        return (
          <section key={player.id} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              {player.firstName} {player.lastName}
              <span className="ml-2 text-sm font-normal text-black/60 dark:text-white/60">
                Total : {total}
                {result && result.penalty > 0 ? ` · Pénalité : -${result.penalty}` : ""}
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
                  {canManage && <th className="py-2 pr-4"></th>}
                </tr>
              </thead>
              <tbody>
                {moves.map((move) => (
                  <tr key={move.id} className="border-b border-black/5 dark:border-white/5">
                    {canManage ? (
                      <td colSpan={7} className="py-1.5">
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
                      </>
                    )}
                  </tr>
                ))}
                {moves.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-2 text-black/50 dark:text-white/50">
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
