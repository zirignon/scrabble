import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { tournamentStatusLabel } from "@/lib/labels";
import { matchRow, matchCell, scoreCell, MatchStatusPill } from "@/components/public/StatusPill";

export default async function TournamentRoundsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: {
      rounds: {
        orderBy: { number: "asc" },
        include: {
          matches: {
            include: {
              homePlayer: true,
              awayPlayer: true,
              homeTeam: true,
              awayTeam: true,
              pool: true,
            },
          },
        },
      },
    },
  });
  if (!tournament || tournament.type !== "CLASSIC") notFound();

  return (
    <div className="mx-auto max-w-4xl w-full px-4 py-10 flex flex-col gap-6">
      <div>
        <Link
          href={`/tournois/${tournament.slug}`}
          className="text-sm text-black/60 dark:text-white/60 hover:underline"
        >
          ← Retour au tournoi
        </Link>
        <p className="text-sm text-black/50 dark:text-white/50 mt-1">
          Scrabble classique · {tournamentStatusLabel[tournament.status]}
        </p>
        <h1 className="font-heading text-3xl font-semibold">
          Rondes &amp; résultats — {tournament.name}
        </h1>
      </div>

      <div className="flex flex-col gap-6">
        {tournament.rounds.map((round) => {
          const roundHasPoolMatches = round.matches.some((m) => m.pool);

          if (!tournament.isTeamEvent && tournament.format === "GROUPS" && roundHasPoolMatches) {
            const byPool = new Map<
              string,
              { poolName: string; matches: typeof round.matches }
            >();
            for (const match of round.matches) {
              if (!match.pool) continue;
              if (!byPool.has(match.pool.id)) {
                byPool.set(match.pool.id, { poolName: match.pool.name, matches: [] });
              }
              byPool.get(match.pool.id)!.matches.push(match);
            }

            return (
              <div key={round.id} className="flex flex-col gap-4">
                <h3 className="font-medium">Ronde {round.number}</h3>
                {[...byPool.values()].map(({ poolName, matches }) => (
                  <div key={poolName} className="overflow-x-auto">
                    <p className="text-sm font-medium mb-1">{poolName}</p>
                    <table className="w-full text-sm border-collapse">
                      <tbody>
                        {matches.map((match) => (
                          <tr key={match.id} className={matchRow}>
                            <td className={matchCell}>
                              {match.homePlayer
                                ? `${match.homePlayer.firstName} ${match.homePlayer.lastName}`
                                : "—"}
                            </td>
                            <td className={scoreCell}>
                              {match.isBye
                                ? "—"
                                : `${match.homeScore ?? "-"} - ${match.awayScore ?? "-"}`}
                            </td>
                            <td className={matchCell}>
                              {match.awayPlayer
                                ? `${match.awayPlayer.firstName} ${match.awayPlayer.lastName}`
                                : "—"}
                            </td>
                            <td className={matchCell}>
                              <MatchStatusPill status={match.status} isBye={match.isBye} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            );
          }

          if (!tournament.isTeamEvent) {
            return (
              <div key={round.id} className="overflow-x-auto">
                <h3 className="font-medium mb-2">
                  Ronde {round.number}
                  {tournament.format === "GROUPS" && " — Phase finale"}
                </h3>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {round.matches.map((match) => (
                      <tr key={match.id} className={matchRow}>
                        <td className={matchCell}>
                          {match.homePlayer
                            ? `${match.homePlayer.firstName} ${match.homePlayer.lastName}`
                            : "—"}
                        </td>
                        <td className={scoreCell}>
                          {match.isBye
                            ? "—"
                            : `${match.homeScore ?? "-"} - ${match.awayScore ?? "-"}`}
                        </td>
                        <td className={matchCell}>
                          {match.awayPlayer
                            ? `${match.awayPlayer.firstName} ${match.awayPlayer.lastName}`
                            : "—"}
                        </td>
                        <td className={matchCell}>
                          <MatchStatusPill status={match.status} isBye={match.isBye} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          if (tournament.format === "GROUPS" && roundHasPoolMatches) {
            // Tournoi par équipes en poules : regroupe d'abord par
            // poule, puis par confrontation d'équipes.
            const byPool = new Map<
              string,
              {
                poolName: string;
                encounters: Map<string, { homeTeamName: string; awayTeamName: string; matches: typeof round.matches }>;
                byeTeamNames: string[];
              }
            >();

            for (const match of round.matches) {
              if (!match.pool) continue;
              if (!byPool.has(match.pool.id)) {
                byPool.set(match.pool.id, {
                  poolName: match.pool.name,
                  encounters: new Map(),
                  byeTeamNames: [],
                });
              }
              const entry = byPool.get(match.pool.id)!;
              if (match.isBye) {
                if (match.homeTeam) entry.byeTeamNames.push(match.homeTeam.name);
                continue;
              }
              if (!match.homeTeam || !match.awayTeam) continue;
              const key = `${match.homeTeam.id}:${match.awayTeam.id}`;
              if (!entry.encounters.has(key)) {
                entry.encounters.set(key, {
                  homeTeamName: match.homeTeam.name,
                  awayTeamName: match.awayTeam.name,
                  matches: [],
                });
              }
              entry.encounters.get(key)!.matches.push(match);
            }

            return (
              <div key={round.id} className="flex flex-col gap-5">
                <h3 className="font-medium">Ronde {round.number}</h3>
                {[...byPool.values()].map(({ poolName, encounters, byeTeamNames }) => (
                  <div key={poolName} className="flex flex-col gap-3">
                    <p className="text-sm font-semibold">{poolName}</p>
                    {[...encounters.values()].map(({ homeTeamName, awayTeamName, matches }) => (
                      <div key={`${homeTeamName}:${awayTeamName}`} className="pl-4 overflow-x-auto">
                        <p className="text-sm font-medium mb-1">
                          {homeTeamName} vs {awayTeamName}
                        </p>
                        <table className="w-full text-sm border-collapse">
                          <tbody>
                            {matches.map((match) => (
                              <tr key={match.id} className={matchRow}>
                                <td className={matchCell}>
                                  {match.homePlayer
                                    ? `${match.homePlayer.firstName} ${match.homePlayer.lastName}`
                                    : "—"}
                                </td>
                                <td className={scoreCell}>
                                  {`${match.homeScore ?? "-"} - ${match.awayScore ?? "-"}`}
                                </td>
                                <td className={matchCell}>
                                  {match.awayPlayer
                                    ? `${match.awayPlayer.firstName} ${match.awayPlayer.lastName}`
                                    : "—"}
                                </td>
                                <td className={matchCell}>
                                  <MatchStatusPill status={match.status} isBye={false} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                    {byeTeamNames.map((name) => (
                      <p key={name} className="text-sm text-black/50 dark:text-white/50 pl-4">
                        {name} : équipe exempte pour cette ronde.
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            );
          }

          // Tournoi par équipes : regroupe les échiquiers par confrontation.
          const encounters = new Map<
            string,
            { homeTeamName: string; awayTeamName: string; matches: typeof round.matches }
          >();
          const byeTeamNames: string[] = [];

          for (const match of round.matches) {
            if (match.isBye) {
              if (match.homeTeam) byeTeamNames.push(match.homeTeam.name);
              continue;
            }
            if (!match.homeTeam || !match.awayTeam) continue;
            const key = `${match.homeTeam.id}:${match.awayTeam.id}`;
            if (!encounters.has(key)) {
              encounters.set(key, {
                homeTeamName: match.homeTeam.name,
                awayTeamName: match.awayTeam.name,
                matches: [],
              });
            }
            encounters.get(key)!.matches.push(match);
          }

          return (
            <div key={round.id} className="flex flex-col gap-4">
              <h3 className="font-medium">
                Ronde {round.number}
                {tournament.format === "GROUPS" && " — Phase finale"}
              </h3>
              {[...encounters.values()].map(({ homeTeamName, awayTeamName, matches }) => (
                <div key={`${homeTeamName}:${awayTeamName}`} className="overflow-x-auto">
                  <p className="text-sm font-medium mb-1">
                    {homeTeamName} vs {awayTeamName}
                  </p>
                  <table className="w-full text-sm border-collapse">
                    <tbody>
                      {matches.map((match) => (
                        <tr key={match.id} className={matchRow}>
                          <td className={matchCell}>
                            {match.homePlayer
                              ? `${match.homePlayer.firstName} ${match.homePlayer.lastName}`
                              : "—"}
                          </td>
                          <td className={scoreCell}>
                            {`${match.homeScore ?? "-"} - ${match.awayScore ?? "-"}`}
                          </td>
                          <td className={matchCell}>
                            {match.awayPlayer
                              ? `${match.awayPlayer.firstName} ${match.awayPlayer.lastName}`
                              : "—"}
                          </td>
                          <td className={matchCell}>
                            <MatchStatusPill status={match.status} isBye={false} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {byeTeamNames.map((name) => (
                <p key={name} className="text-sm text-black/50 dark:text-white/50">
                  {name} : équipe exempte pour cette ronde.
                </p>
              ))}
            </div>
          );
        })}
        {tournament.rounds.length === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            Les rondes n&apos;ont pas encore été publiées.
          </p>
        )}
      </div>
    </div>
  );
}
