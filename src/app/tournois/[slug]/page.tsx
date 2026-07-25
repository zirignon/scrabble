import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { selfRegisterAction } from "@/lib/actions/tournaments";

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

// Styles partagés par toutes les tables de rondes/résultats et parties/scores
// de cette page.
const matchRow = "border-b border-black/5 dark:border-white/5 hover:bg-navy/[0.035] dark:hover:bg-white/[0.05] transition-colors";
const matchCell = "py-2 pr-4";
const scoreCell = "py-2 pr-4 font-semibold tabular-nums";

const headRow = "text-left border-b-2 border-navy/20 dark:border-navy-light/30";
const th = "py-2.5 pr-4 text-xs font-semibold uppercase tracking-wide text-black/45 dark:text-white/50";
const exportLink = "text-sm text-navy dark:text-navy-light underline underline-offset-2";

const pillClass: Record<string, string> = {
  moss: "bg-moss/10 text-moss dark:bg-moss-light/15 dark:text-moss-light",
  gold: "bg-gold/10 text-gold dark:bg-gold-light/15 dark:text-gold-light",
  brick: "bg-brick/10 text-brick dark:bg-brick-light/15 dark:text-brick-light",
  muted: "bg-black/5 text-black/50 dark:bg-white/10 dark:text-white/50",
};

function Pill({ tone, children }: { tone: keyof typeof pillClass; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${pillClass[tone]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function MatchStatusPill({ status, isBye }: { status: string; isBye: boolean }) {
  if (isBye) return <Pill tone="muted">Exempt</Pill>;
  if (status === "PLAYED") return <Pill tone="moss">Joué</Pill>;
  if (status === "SCHEDULED") return <Pill tone="gold">À jouer</Pill>;
  if (status === "CANCELLED") return <Pill tone="muted">Annulé</Pill>;
  return <Pill tone="brick">{matchStatusLabel[status] ?? status}</Pill>;
}

export default async function TournamentPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: {
      registrations: {
        include: { player: { include: { club: true } } },
        orderBy: { player: { lastName: "asc" } },
      },
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

  return (
    <div className="mx-auto max-w-4xl w-full px-4 py-10 flex flex-col gap-10">
      <div>
        <p className="text-sm text-black/50 dark:text-white/50">
          {tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"}
          {" · "}
          {statusLabel[tournament.status]}
        </p>
        <h1 className="font-heading text-3xl font-semibold">{tournament.name}</h1>
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

        <p className="mt-3 flex gap-4">
          <Link
            href={`/tournois/${tournament.slug}/classement`}
            className="text-sm text-navy dark:text-navy-light hover:underline"
          >
            🏆 Classement
          </Link>
          <Link
            href={`/tournois/${tournament.slug}/affichage`}
            target="_blank"
            className="text-sm text-navy dark:text-navy-light hover:underline"
          >
            📺 Affichage grand écran
          </Link>
        </p>

        {session && hasPlayerProfile && !isRegistered && tournament.status === "REGISTRATION_OPEN" && (
          <form action={selfRegisterAction.bind(null, tournament.id)} className="mt-4">
            <button
              type="submit"
              className="rounded-md bg-navy text-white px-4 py-2 text-sm font-medium"
            >
              S&apos;inscrire à ce tournoi
            </button>
          </form>
        )}
        {session && isRegistered && (
          <p className="mt-4 text-sm text-navy dark:text-navy-light">
            Vous êtes inscrit à ce tournoi.
          </p>
        )}
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-xl font-semibold">
            Participants ({tournament.registrations.length})
          </h2>
          {tournament.registrations.length > 0 && (
            <div className="flex gap-3">
              <a href={`/api/tournois/${tournament.id}/participants/export`} className={exportLink}>
                Exporter en CSV
              </a>
              <a href={`/api/tournois/${tournament.id}/participants/export/pdf`} className={exportLink}>
                Exporter en PDF
              </a>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className={headRow}>
                <th className={th}>Numéro</th>
                <th className={th}>Licence</th>
                <th className={th}>Nom et prénoms</th>
                <th className={th}>Club</th>
                <th className={th}>Fédé</th>
              </tr>
            </thead>
            <tbody>
              {tournament.registrations.map((r, i) => (
                <tr key={r.id} className={matchRow}>
                  <td className={`${matchCell} tabular-nums`}>{i + 1}</td>
                  <td className={matchCell}>{r.player.licenseNumber ?? "—"}</td>
                  <td className={`${matchCell} font-medium`}>
                    {r.player.lastName} {r.player.firstName}
                  </td>
                  <td className={matchCell}>{r.player.club?.name ?? "—"}</td>
                  <td className={matchCell}>{r.player.club?.federation ?? "—"}</td>
                </tr>
              ))}
              {tournament.registrations.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-black/50 dark:text-white/50">
                    Aucun participant inscrit.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {tournament.type === "CLASSIC" ? (
        <section>
          <h2 className="font-heading text-xl font-semibold mb-3">Rondes &amp; résultats</h2>
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
        </section>
      ) : (
        <section>
          <h2 className="font-heading text-xl font-semibold mb-3">Parties &amp; scores</h2>
          <div className="flex flex-col gap-6">
            {tournament.games.map((game) => (
              <div key={game.id} className="overflow-x-auto">
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
                        <tr key={result.id} className={matchRow}>
                          <td className={matchCell}>
                            {result.player.firstName} {result.player.lastName}
                          </td>
                          <td className={scoreCell}>{result.score}</td>
                          {result.penalty > 0 && (
                            <td className="py-2 pr-4">
                              <Pill tone="brick">-{result.penalty} pénalité</Pill>
                            </td>
                          )}
                          {game.top != null && (
                            <td className="py-2 pr-4 text-xs text-black/50 dark:text-white/50">
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
