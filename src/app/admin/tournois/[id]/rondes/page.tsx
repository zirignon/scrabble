import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import {
  addManualRoundAction,
  addMatchAction,
  generateNextSwissRoundAction,
  generateRoundRobinAction,
  recordMatchResultAction,
} from "@/lib/actions/classic";

const statusLabel: Record<string, string> = {
  SCHEDULED: "À jouer",
  PLAYED: "Joué",
  FORFEIT_HOME: "Forfait (domicile)",
  FORFEIT_AWAY: "Forfait (extérieur)",
  CANCELLED: "Annulé",
};

export default async function RoundsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole(STAFF_ROLES);

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      rounds: {
        orderBy: { number: "asc" },
        include: {
          matches: {
            include: { homePlayer: true, awayPlayer: true },
            orderBy: { table: "asc" },
          },
        },
      },
      registrations: { include: { player: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!tournament || tournament.type !== "CLASSIC") notFound();

  const canManage = canManageTournament(session, tournament.organizerId);
  const players = tournament.registrations.map((r) => r.player);
  const generateBound = generateRoundRobinAction.bind(null, tournament.id);
  const generateSwissBound = generateNextSwissRoundAction.bind(null, tournament.id);
  const addRoundBound = addManualRoundAction.bind(null, tournament.id);

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
          Rondes — {tournament.name}
        </h1>
      </div>

      {canManage && (
        <div className="flex gap-3">
          {tournament.format === "ROUND_ROBIN" && tournament.rounds.length === 0 && (
            <form action={generateBound}>
              <button
                type="submit"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              >
                Générer les rondes (round-robin)
              </button>
            </form>
          )}
          {tournament.format === "SWISS" && (
            <form action={generateSwissBound}>
              <button
                type="submit"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              >
                Générer la ronde suisse suivante
              </button>
            </form>
          )}
          <form action={addRoundBound}>
            <button
              type="submit"
              className="rounded-md border border-black/10 dark:border-white/20 px-4 py-2 text-sm font-medium"
            >
              + Ajouter une ronde manuelle
            </button>
          </form>
        </div>
      )}

      {tournament.rounds.map((round) => (
        <section key={round.id} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Ronde {round.number}</h2>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-black/10 dark:border-white/10">
                <th className="py-2 pr-4">Table</th>
                <th className="py-2 pr-4">Domicile</th>
                <th className="py-2 pr-4">Score</th>
                <th className="py-2 pr-4">Extérieur</th>
                <th className="py-2 pr-4">Statut</th>
              </tr>
            </thead>
            <tbody>
              {round.matches.map((match) => (
                <tr key={match.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-4">{match.table ?? "—"}</td>
                  <td className="py-2 pr-4">
                    {match.homePlayer
                      ? `${match.homePlayer.firstName} ${match.homePlayer.lastName}`
                      : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {match.isBye ? (
                      <span className="text-black/50 dark:text-white/50">Exempt (bye)</span>
                    ) : canManage ? (
                      <form
                        action={recordMatchResultAction.bind(
                          null,
                          tournament.id,
                          match.id
                        )}
                        className="flex items-center gap-1"
                      >
                        <input
                          type="number"
                          name="homeScore"
                          defaultValue={match.homeScore ?? ""}
                          className="w-16 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
                        />
                        <span>-</span>
                        <input
                          type="number"
                          name="awayScore"
                          defaultValue={match.awayScore ?? ""}
                          className="w-16 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
                        />
                        <select
                          name="status"
                          defaultValue={match.status}
                          className="rounded border border-black/10 dark:border-white/20 px-1 py-1 bg-transparent text-xs"
                        >
                          {Object.entries(statusLabel).map(([value, label]) => (
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
                      </form>
                    ) : (
                      <span>
                        {match.homeScore ?? "-"} - {match.awayScore ?? "-"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {match.awayPlayer
                      ? `${match.awayPlayer.firstName} ${match.awayPlayer.lastName}`
                      : "—"}
                  </td>
                  <td className="py-2 pr-4">{statusLabel[match.status]}</td>
                </tr>
              ))}
              {round.matches.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-black/50 dark:text-white/50">
                    Aucun match dans cette ronde.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {canManage && (
            <form
              action={addMatchAction.bind(null, tournament.id, round.id)}
              className="flex flex-wrap items-end gap-2"
            >
              <select
                name="homePlayerId"
                required
                className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
              >
                <option value="">Domicile...</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
              </select>
              <select
                name="awayPlayerId"
                required
                className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
              >
                <option value="">Extérieur...</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
              </select>
              <input
                type="number"
                name="table"
                placeholder="Table"
                className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
              />
              <button
                type="submit"
                className="rounded border border-black/10 dark:border-white/20 px-3 py-1.5 text-sm"
              >
                + Match
              </button>
            </form>
          )}
        </section>
      ))}

      {tournament.rounds.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          Aucune ronde créée. Générez un round-robin ou ajoutez une ronde manuelle.
        </p>
      )}
    </div>
  );
}
