import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { selfRegisterAction } from "@/lib/actions/tournaments";
import { computeClassicStandings } from "@/lib/classic/standings";
import { computeDuplicateStandings } from "@/lib/duplicate/standings";

const statusLabel: Record<string, string> = {
  DRAFT: "Brouillon",
  REGISTRATION_OPEN: "Inscriptions ouvertes",
  REGISTRATION_CLOSED: "Inscriptions fermées",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminé",
  ARCHIVED: "Archivé",
};

const matchStatusLabel: Record<string, string> = {
  SCHEDULED: "À jouer",
  PLAYED: "Joué",
  FORFEIT_HOME: "Forfait (domicile)",
  FORFEIT_AWAY: "Forfait (extérieur)",
  CANCELLED: "Annulé",
};

export default async function TournamentPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: {
      registrations: { include: { player: { include: { club: true } } } },
      rounds: {
        orderBy: { number: "asc" },
        include: { matches: { include: { homePlayer: true, awayPlayer: true } } },
      },
      games: {
        orderBy: { number: "asc" },
        include: { results: { include: { player: true } } },
      },
    },
  });
  if (!tournament) notFound();

  const session = await getSession();
  let isRegistered = false;
  let hasPlayerProfile = false;
  if (session) {
    const player = await prisma.player.findUnique({
      where: { userId: session.userId },
    });
    hasPlayerProfile = !!player;
    isRegistered = player
      ? tournament.registrations.some((r) => r.playerId === player.id)
      : false;
  }

  const classicStandings =
    tournament.type === "CLASSIC" ? await computeClassicStandings(tournament.id) : [];
  const duplicateStandings =
    tournament.type === "DUPLICATE" ? await computeDuplicateStandings(tournament.id) : [];
  const standingsCount =
    tournament.type === "CLASSIC" ? classicStandings.length : duplicateStandings.length;

  return (
    <div className="mx-auto max-w-4xl w-full px-4 py-10 flex flex-col gap-10">
      <div>
        <p className="text-sm text-black/50 dark:text-white/50">
          {tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"}
          {" · "}
          {statusLabel[tournament.status]}
        </p>
        <h1 className="text-3xl font-semibold">{tournament.name}</h1>
        <p className="text-sm text-black/60 dark:text-white/60 mt-2">
          {new Date(tournament.startDate).toLocaleDateString("fr-FR")}
          {tournament.endDate &&
            ` — ${new Date(tournament.endDate).toLocaleDateString("fr-FR")}`}
          {tournament.venue ? ` · ${tournament.venue}` : ""}
        </p>
        {tournament.description && (
          <p className="mt-3 max-w-2xl text-black/80 dark:text-white/80">
            {tournament.description}
          </p>
        )}

        {session && hasPlayerProfile && !isRegistered && tournament.status === "REGISTRATION_OPEN" && (
          <form action={selfRegisterAction.bind(null, tournament.id)} className="mt-4">
            <button
              type="submit"
              className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
            >
              S&apos;inscrire à ce tournoi
            </button>
          </form>
        )}
        {session && isRegistered && (
          <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-400">
            Vous êtes inscrit à ce tournoi.
          </p>
        )}
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-3">
          Participants ({tournament.registrations.length})
        </h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          {tournament.registrations.map((r) => (
            <li key={r.id} className="text-black/80 dark:text-white/80">
              {r.player.firstName} {r.player.lastName}
              {r.player.club && (
                <span className="text-black/50 dark:text-white/50">
                  {" "}
                  ({r.player.club.name})
                </span>
              )}
            </li>
          ))}
          {tournament.registrations.length === 0 && (
            <li className="text-black/50 dark:text-white/50">Aucun participant inscrit.</li>
          )}
        </ul>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Classement</h2>
          <a
            href={`/api/tournois/${tournament.id}/classement/export`}
            className="text-sm text-emerald-700 dark:text-emerald-400 underline"
          >
            Exporter en CSV
          </a>
        </div>
        {tournament.type === "CLASSIC" ? (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-black/10 dark:border-white/10">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Joueur</th>
                <th className="py-2 pr-4">J</th>
                <th className="py-2 pr-4">V</th>
                <th className="py-2 pr-4">N</th>
                <th className="py-2 pr-4">D</th>
                <th className="py-2 pr-4">Pts</th>
                <th className="py-2 pr-4" title="Buchholz">Bchz</th>
                <th className="py-2 pr-4" title="Sonneborn-Berger">SB</th>
                <th className="py-2 pr-4">Diff</th>
              </tr>
            </thead>
            <tbody>
              {classicStandings.map((row, i) => (
                <tr key={row.playerId} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-4">{i + 1}</td>
                  <td className="py-2 pr-4">
                    {row.firstName} {row.lastName}
                  </td>
                  <td className="py-2 pr-4">{row.played}</td>
                  <td className="py-2 pr-4">{row.wins}</td>
                  <td className="py-2 pr-4">{row.draws}</td>
                  <td className="py-2 pr-4">{row.losses}</td>
                  <td className="py-2 pr-4 font-medium">{row.matchPoints}</td>
                  <td className="py-2 pr-4">{row.buchholz}</td>
                  <td className="py-2 pr-4">{row.sonnebornBerger}</td>
                  <td className="py-2 pr-4">{row.diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-black/10 dark:border-white/10">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Joueur</th>
                <th className="py-2 pr-4">Parties</th>
                <th className="py-2 pr-4">Score total</th>
                <th className="py-2 pr-4">Pénalités</th>
                <th className="py-2 pr-4">Net</th>
              </tr>
            </thead>
            <tbody>
              {duplicateStandings.map((row, i) => (
                <tr key={row.playerId} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-4">{i + 1}</td>
                  <td className="py-2 pr-4">
                    {row.firstName} {row.lastName}
                  </td>
                  <td className="py-2 pr-4">{row.gamesPlayed}</td>
                  <td className="py-2 pr-4">{row.totalScore}</td>
                  <td className="py-2 pr-4">{row.totalPenalty}</td>
                  <td className="py-2 pr-4 font-medium">{row.net}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {standingsCount === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            Le classement sera disponible une fois les premiers résultats saisis.
          </p>
        )}
      </section>

      {tournament.type === "CLASSIC" ? (
        <section>
          <h2 className="text-xl font-semibold mb-3">Rondes &amp; résultats</h2>
          <div className="flex flex-col gap-6">
            {tournament.rounds.map((round) => (
              <div key={round.id}>
                <h3 className="font-medium mb-2">Ronde {round.number}</h3>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {round.matches.map((match) => (
                      <tr key={match.id} className="border-b border-black/5 dark:border-white/5">
                        <td className="py-1.5 pr-4">
                          {match.homePlayer
                            ? `${match.homePlayer.firstName} ${match.homePlayer.lastName}`
                            : "—"}
                        </td>
                        <td className="py-1.5 pr-4 font-medium">
                          {match.isBye
                            ? "Exempt"
                            : `${match.homeScore ?? "-"} - ${match.awayScore ?? "-"}`}
                        </td>
                        <td className="py-1.5 pr-4">
                          {match.awayPlayer
                            ? `${match.awayPlayer.firstName} ${match.awayPlayer.lastName}`
                            : "—"}
                        </td>
                        <td className="py-1.5 pr-4 text-xs text-black/50 dark:text-white/50">
                          {matchStatusLabel[match.status]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {tournament.rounds.length === 0 && (
              <p className="text-sm text-black/50 dark:text-white/50">
                Les rondes n&apos;ont pas encore été publiées.
              </p>
            )}
          </div>
        </section>
      ) : (
        <section>
          <h2 className="text-xl font-semibold mb-3">Parties &amp; scores</h2>
          <div className="flex flex-col gap-6">
            {tournament.games.map((game) => (
              <div key={game.id}>
                <h3 className="font-medium mb-2">
                  Partie {game.number}
                  {game.top != null && (
                    <span className="text-xs text-black/50 dark:text-white/50 ml-2">
                      Top : {game.top}
                    </span>
                  )}
                </h3>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {game.results.map((result) => {
                      const net = result.score - result.penalty;
                      return (
                        <tr key={result.id} className="border-b border-black/5 dark:border-white/5">
                          <td className="py-1.5 pr-4">
                            {result.player.firstName} {result.player.lastName}
                          </td>
                          <td className="py-1.5 pr-4 font-medium">{result.score}</td>
                          {result.penalty > 0 && (
                            <td className="py-1.5 pr-4 text-xs text-red-600">
                              -{result.penalty} pénalité
                            </td>
                          )}
                          {game.top != null && (
                            <td className="py-1.5 pr-4 text-xs text-black/50 dark:text-white/50">
                              écart au top : {game.top - net}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
            {tournament.games.length === 0 && (
              <p className="text-sm text-black/50 dark:text-white/50">
                Aucun résultat publié pour le moment.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
