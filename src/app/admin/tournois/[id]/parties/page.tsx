import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { addGameAction, saveGameScoresAction } from "@/lib/actions/duplicate";

export default async function GamesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole(STAFF_ROLES);

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      games: {
        orderBy: { number: "asc" },
        include: { results: true },
      },
      registrations: { include: { player: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!tournament || tournament.type !== "DUPLICATE") notFound();

  const canManage = canManageTournament(session, tournament.organizerId);
  const players = tournament.registrations.map((r) => r.player);
  const addGameBound = addGameAction.bind(null, tournament.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/admin/tournois/${tournament.id}`}
          className="text-sm text-black/60 dark:text-white/60 hover:underline"
        >
          ← Retour au tournoi
        </Link>
        <h1 className="text-2xl font-semibold mt-1">
          Parties — {tournament.name}
        </h1>
      </div>

      {canManage && (
        <form action={addGameBound}>
          <button
            type="submit"
            className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
          >
            + Nouvelle partie
          </button>
        </form>
      )}

      {players.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          Inscrivez des joueurs avant de saisir des scores.
        </p>
      )}

      {tournament.games.map((game) => {
        const resultByPlayer = new Map(game.results.map((r) => [r.playerId, r]));
        return (
          <section key={game.id} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              Partie {game.number}
              {game.playedAt && (
                <span className="text-xs text-black/50 dark:text-white/50 ml-2">
                  {new Date(game.playedAt).toLocaleDateString("fr-FR")}
                </span>
              )}
            </h2>

            <form
              action={saveGameScoresAction.bind(null, tournament.id, game.id)}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor={`top_${game.id}`} className="font-medium">
                  Top de la partie
                </label>
                {canManage ? (
                  <input
                    id={`top_${game.id}`}
                    type="number"
                    name="top"
                    defaultValue={game.top ?? ""}
                    className="w-24 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
                  />
                ) : (
                  <span>{game.top ?? "—"}</span>
                )}
              </div>

              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b border-black/10 dark:border-white/10">
                    <th className="py-2 pr-4">Joueur</th>
                    <th className="py-2 pr-4">Score</th>
                    <th className="py-2 pr-4">Pénalité</th>
                    <th className="py-2 pr-4">Net</th>
                    <th className="py-2 pr-4">Écart au top</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => {
                    const result = resultByPlayer.get(player.id);
                    const net = result ? result.score - result.penalty : null;
                    return (
                      <tr key={player.id} className="border-b border-black/5 dark:border-white/5">
                        <td className="py-2 pr-4">
                          {player.firstName} {player.lastName}
                        </td>
                        <td className="py-2 pr-4">
                          {canManage ? (
                            <input
                              type="number"
                              name={`score_${player.id}`}
                              defaultValue={result?.score ?? ""}
                              className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
                            />
                          ) : (
                            (result?.score ?? "—")
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          {canManage ? (
                            <input
                              type="number"
                              name={`penalty_${player.id}`}
                              defaultValue={result?.penalty ?? 0}
                              className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
                            />
                          ) : (
                            (result?.penalty ?? 0)
                          )}
                        </td>
                        <td className="py-2 pr-4">{net ?? "—"}</td>
                        <td className="py-2 pr-4">
                          {net !== null && game.top !== null ? game.top - net : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {canManage && (
                <button
                  type="submit"
                  className="self-start rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
                >
                  Enregistrer les scores
                </button>
              )}
            </form>
          </section>
        );
      })}

      {tournament.games.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          Aucune partie créée pour le moment.
        </p>
      )}
    </div>
  );
}
