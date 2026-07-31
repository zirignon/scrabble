import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computeClassicStandings } from "@/lib/classic/standings";
import { computeDuplicateStandingsWithGames } from "@/lib/duplicate/standings";
import { computeClassicTeamStandings } from "@/lib/classic/teamStandings";
import { computeDuplicateTeamStandings } from "@/lib/duplicate/teamStandings";
import { computeClassicPoolStandings } from "@/lib/classic/poolStandings";
import { computeClassicTeamPoolStandings } from "@/lib/classic/teamPoolStandings";
import { tournamentStatusLabel } from "@/lib/labels";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PoolBadge } from "@/components/public/StatusPill";

// Styles partagés par tous les tableaux de classement de cette page : un
// filet plus marqué sous l'en-tête, des libellés de colonne discrets en
// petites capitales, un léger zébrage pour guider l'œil, et les colonnes
// chiffrées alignées à droite en tabular-nums pour que les scores
// s'alignent proprement.
const headRow = "text-left border-b-2 border-navy/20 dark:border-navy-light/30";
const th = "py-2.5 pr-4 text-xs font-semibold uppercase tracking-wide text-black/45 dark:text-white/50";
const thNum = `${th} text-right`;
const row = "border-b border-black/5 dark:border-white/5 even:bg-navy/[0.02] dark:even:bg-navy-light/[0.03] hover:bg-navy/[0.035] dark:hover:bg-white/[0.05] transition-colors";
const td = "py-2.5 pr-4";
const tdNum = `${td} text-right tabular-nums`;
const exportLink = "text-sm text-navy dark:text-navy-light underline underline-offset-2";
const sectionHeading = "font-heading text-xl font-semibold text-navy dark:text-navy-light";

function Rank({ value }: { value: number }) {
  return (
    <span className={value === 1 ? "font-heading font-semibold text-gold dark:text-gold-light" : ""}>
      {value}
    </span>
  );
}

export default async function TournamentStandingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const tournament = await prisma.tournament.findUnique({ where: { slug } });
  if (!tournament) notFound();

  const classicStandings =
    tournament.type === "CLASSIC" ? await computeClassicStandings(tournament.id) : [];
  const duplicateStandingsData =
    tournament.type === "DUPLICATE"
      ? await computeDuplicateStandingsWithGames(tournament.id)
      : { rows: [], games: [], topCumul: null };
  const duplicateStandings = duplicateStandingsData.rows;
  const standingsCount =
    tournament.type === "CLASSIC" ? classicStandings.length : duplicateStandings.length;

  const classicTeamStandings =
    tournament.isTeamEvent && tournament.type === "CLASSIC"
      ? await computeClassicTeamStandings(tournament.id)
      : [];
  const duplicateTeamStandings =
    tournament.isTeamEvent && tournament.type === "DUPLICATE"
      ? await computeDuplicateTeamStandings(tournament.id)
      : [];

  const poolStandings =
    tournament.type === "CLASSIC" && tournament.format === "GROUPS" && !tournament.isTeamEvent
      ? await computeClassicPoolStandings(tournament.id)
      : [];
  const teamPoolStandings =
    tournament.type === "CLASSIC" && tournament.format === "GROUPS" && tournament.isTeamEvent
      ? await computeClassicTeamPoolStandings(tournament.id)
      : [];

  return (
    <div className="mx-auto max-w-4xl w-full px-4 py-10 flex flex-col gap-10">
      <LiveRefresh tournamentId={tournament.id} />
      <div>
        <Link
          href={`/tournois/${tournament.slug}`}
          className="text-sm text-black/60 dark:text-white/60 hover:underline"
        >
          ← Retour au tournoi
        </Link>
        <p className="text-sm text-black/50 dark:text-white/50 mt-1">
          {tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"}
          {" · "}
          {tournamentStatusLabel[tournament.status]}
        </p>
        <h1 className="font-heading text-3xl font-semibold">Classement — {tournament.name}</h1>
      </div>

      {!(tournament.type === "CLASSIC" && tournament.format === "GROUPS") && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className={sectionHeading}>Classement</h2>
            <div className="flex gap-3">
              <a href={`/api/tournois/${tournament.id}/classement/export`} className={exportLink}>
                Exporter en CSV
              </a>
              <a href={`/api/tournois/${tournament.id}/classement/export/pdf`} className={exportLink}>
                Exporter en PDF
              </a>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          {tournament.type === "CLASSIC" ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className={headRow}>
                  <th className={`${th} pl-4`}>#</th>
                  <th className={th}>Joueur</th>
                  <th className={th}>Âge</th>
                  <th className={th}>Club</th>
                  <th className={th}>Fédé</th>
                  <th className={th}>Classement</th>
                  <th className={thNum}>J</th>
                  <th className={thNum}>V</th>
                  <th className={thNum}>N</th>
                  <th className={thNum}>D</th>
                  <th className={thNum}>Pts</th>
                  <th className={thNum} title="Buchholz">Bchz</th>
                  <th className={thNum} title="Buchholz médian">Bchz méd.</th>
                  <th className={thNum} title="Sonneborn-Berger">SB</th>
                  <th className={thNum} title="Score cumulé progressif">Cumul</th>
                  <th className={thNum}>Diff</th>
                </tr>
              </thead>
              <tbody>
                {classicStandings.map((r, i) => (
                  <tr key={r.playerId} className={row}>
                    <td className={`${td} pl-4`}><Rank value={i + 1} /></td>
                    <td className={`${td} font-medium`}>{r.lastName} {r.firstName}</td>
                    <td className={td}>{r.category ?? "—"}</td>
                    <td className={td}>{r.clubName ?? "—"}</td>
                    <td className={td}>{r.federation ?? "—"}</td>
                    <td className={td}>{r.classification ?? "—"}</td>
                    <td className={tdNum}>{r.played}</td>
                    <td className={tdNum}>{r.wins}</td>
                    <td className={tdNum}>{r.draws}</td>
                    <td className={tdNum}>{r.losses}</td>
                    <td className={`${tdNum} font-semibold`}>{r.matchPoints}</td>
                    <td className={tdNum}>{r.buchholz}</td>
                    <td className={tdNum}>{r.buchholzMedian}</td>
                    <td className={tdNum}>{r.sonnebornBerger}</td>
                    <td className={tdNum}>{r.cumulativeScore}</td>
                    <td className={tdNum}>{r.diff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className={headRow}>
                  <th className={`${th} pl-4`}>#</th>
                  <th className={th}>Licence</th>
                  <th className={th}>Nom</th>
                  <th className={th}>Prénoms</th>
                  <th className={th}>Cat.</th>
                  <th className={th}>Série</th>
                  <th className={th}>Club</th>
                  <th className={th}>Nat</th>
                  <th className={thNum} title="Score net cumulé sur toutes les parties">
                    Cumul
                  </th>
                  <th className={thNum}>Négatif</th>
                  <th className={thNum}>%</th>
                  {duplicateStandingsData.games.map((g) => (
                    <th key={g.gameNumber} className={thNum}>
                      P{g.gameNumber}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {duplicateStandingsData.games.length > 0 && (
                  <tr className="border-b border-black/10 dark:border-white/10 text-black/50 dark:text-white/50 text-xs">
                    <td className={td} colSpan={8}>
                      Top
                    </td>
                    <td className={tdNum}>{duplicateStandingsData.topCumul ?? "—"}</td>
                    <td className={tdNum}>—</td>
                    <td className={tdNum}>—</td>
                    {duplicateStandingsData.games.map((g) => (
                      <td key={g.gameNumber} className={tdNum}>
                        {g.top ?? "—"}
                      </td>
                    ))}
                  </tr>
                )}
                {duplicateStandings.map((r, i) => {
                  const topCumul = duplicateStandingsData.topCumul;
                  const negatif = topCumul != null ? r.net - topCumul : null;
                  const pourcentage = topCumul != null && topCumul > 0 ? (r.net / topCumul) * 100 : null;
                  return (
                    <tr key={r.playerId} className={row}>
                      <td className={`${td} pl-4`}><Rank value={i + 1} /></td>
                      <td className={td}>{r.licenseNumber ?? "—"}</td>
                      <td className={`${td} font-medium`}>{r.lastName}</td>
                      <td className={`${td} font-medium`}>{r.firstName}</td>
                      <td className={td}>{r.classification ?? "—"}</td>
                      <td className={td}>{r.category ?? "—"}</td>
                      <td className={td}>{r.clubName ?? "—"}</td>
                      <td className={td}>{r.nationality ?? "—"}</td>
                      <td className={`${tdNum} font-semibold`}>{r.net}</td>
                      <td className={tdNum}>{negatif ?? "—"}</td>
                      <td className={tdNum}>
                        {pourcentage != null ? `${pourcentage.toFixed(2)} %` : "—"}
                      </td>
                      {duplicateStandingsData.games.map((g) => (
                        <td key={g.gameNumber} className={tdNum}>
                          {r.perGame[g.gameNumber] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          </div>
          {standingsCount === 0 && (
            <p className="text-sm text-black/50 dark:text-white/50">
              Le classement sera disponible une fois les premiers résultats saisis.
            </p>
          )}
        </section>
      )}

      {tournament.type === "CLASSIC" && tournament.format === "GROUPS" && !tournament.isTeamEvent && (
        <section>
          <h2 className={`${sectionHeading} mb-3`}>Classement par poule</h2>
          <div className="flex flex-col gap-6">
            {poolStandings.map(({ poolId, poolName, standings }) => (
              <div key={poolId}>
                <div className="mb-2"><PoolBadge name={poolName} /></div>
                <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className={headRow}>
                      <th className={`${th} pl-4`}>#</th>
                      <th className={th}>Joueur</th>
                      <th className={thNum}>J</th>
                      <th className={thNum}>V</th>
                      <th className={thNum}>N</th>
                      <th className={thNum}>D</th>
                      <th className={thNum}>Pts</th>
                      <th className={thNum} title="Buchholz">Bchz</th>
                      <th className={thNum} title="Buchholz médian">Bchz méd.</th>
                      <th className={thNum} title="Sonneborn-Berger">SB</th>
                      <th className={thNum} title="Score cumulé progressif">Cumul</th>
                      <th className={thNum}>Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((r, i) => (
                      <tr key={r.playerId} className={row}>
                        <td className={`${td} pl-4`}><Rank value={i + 1} /></td>
                        <td className={`${td} font-medium`}>{r.lastName} {r.firstName}</td>
                        <td className={tdNum}>{r.played}</td>
                        <td className={tdNum}>{r.wins}</td>
                        <td className={tdNum}>{r.draws}</td>
                        <td className={tdNum}>{r.losses}</td>
                        <td className={`${tdNum} font-semibold`}>{r.matchPoints}</td>
                        <td className={tdNum}>{r.buchholz}</td>
                        <td className={tdNum}>{r.buchholzMedian}</td>
                        <td className={tdNum}>{r.sonnebornBerger}</td>
                        <td className={tdNum}>{r.cumulativeScore}</td>
                        <td className={tdNum}>{r.diff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            ))}
            {poolStandings.length === 0 && (
              <p className="text-sm text-black/50 dark:text-white/50">
                Aucune poule créée pour le moment.
              </p>
            )}
          </div>
        </section>
      )}

      {tournament.type === "CLASSIC" && tournament.format === "GROUPS" && tournament.isTeamEvent && (
        <section>
          <h2 className={`${sectionHeading} mb-3`}>Classement par poule (équipes)</h2>
          <div className="flex flex-col gap-6">
            {teamPoolStandings.map(({ poolId, poolName, standings }) => (
              <div key={poolId}>
                <div className="mb-2"><PoolBadge name={poolName} /></div>
                <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className={headRow}>
                      <th className={`${th} pl-4`}>#</th>
                      <th className={th}>Équipe</th>
                      <th className={thNum}>J</th>
                      <th className={thNum}>V</th>
                      <th className={thNum}>N</th>
                      <th className={thNum}>D</th>
                      <th className={thNum}>Pts</th>
                      <th className={thNum} title="Échiquiers gagnés/nuls/perdus">
                        Éch. G/N/P
                      </th>
                      <th className={thNum}>Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((r, i) => (
                      <tr key={r.teamId} className={row}>
                        <td className={`${td} pl-4`}><Rank value={i + 1} /></td>
                        <td className={`${td} font-medium`}>{r.name}</td>
                        <td className={tdNum}>{r.played}</td>
                        <td className={tdNum}>{r.wins}</td>
                        <td className={tdNum}>{r.draws}</td>
                        <td className={tdNum}>{r.losses}</td>
                        <td className={`${tdNum} font-semibold`}>{r.matchPoints}</td>
                        <td className={tdNum}>{r.boardsWon}/{r.boardsDrawn}/{r.boardsLost}</td>
                        <td className={tdNum}>{r.diff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            ))}
            {teamPoolStandings.length === 0 && (
              <p className="text-sm text-black/50 dark:text-white/50">
                Aucune poule créée pour le moment.
              </p>
            )}
          </div>
        </section>
      )}

      {tournament.isTeamEvent && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className={sectionHeading}>Classement par équipes</h2>
            <div className="flex gap-3">
              <a href={`/api/tournois/${tournament.id}/classement/equipes/export`} className={exportLink}>
                Exporter en CSV
              </a>
              <a href={`/api/tournois/${tournament.id}/classement/equipes/export/pdf`} className={exportLink}>
                Exporter en PDF
              </a>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          {tournament.type === "CLASSIC" ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className={headRow}>
                  <th className={`${th} pl-4`}>#</th>
                  <th className={th}>Équipe</th>
                  <th className={thNum}>J</th>
                  <th className={thNum}>V</th>
                  <th className={thNum}>N</th>
                  <th className={thNum}>D</th>
                  <th className={thNum}>Pts</th>
                  <th className={thNum} title="Échiquiers gagnés/nuls/perdus">
                    Éch. G/N/P
                  </th>
                  <th className={thNum}>Diff</th>
                </tr>
              </thead>
              <tbody>
                {classicTeamStandings.map((r, i) => (
                  <tr key={r.teamId} className={row}>
                    <td className={`${td} pl-4`}><Rank value={i + 1} /></td>
                    <td className={`${td} font-medium`}>{r.name}</td>
                    <td className={tdNum}>{r.played}</td>
                    <td className={tdNum}>{r.wins}</td>
                    <td className={tdNum}>{r.draws}</td>
                    <td className={tdNum}>{r.losses}</td>
                    <td className={`${tdNum} font-semibold`}>{r.matchPoints}</td>
                    <td className={tdNum}>{r.boardsWon}/{r.boardsDrawn}/{r.boardsLost}</td>
                    <td className={tdNum}>{r.diff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className={headRow}>
                  <th className={`${th} pl-4`}>#</th>
                  <th className={th}>Équipe</th>
                  <th className={thNum}>Parties</th>
                  <th className={thNum}>Score total</th>
                  <th className={thNum}>Pénalités</th>
                  <th className={thNum}>Net</th>
                  <th className={thNum}>Négatif</th>
                  <th className={thNum}>%</th>
                </tr>
              </thead>
              <tbody>
                {duplicateTeamStandings.map((r, i) => (
                  <tr key={r.teamId} className={row}>
                    <td className={`${td} pl-4`}><Rank value={i + 1} /></td>
                    <td className={`${td} font-medium`}>{r.name}</td>
                    <td className={tdNum}>{r.gamesPlayed}</td>
                    <td className={tdNum}>{r.totalScore}</td>
                    <td className={tdNum}>{r.totalPenalty}</td>
                    <td className={tdNum}>{r.net}</td>
                    <td className={tdNum}>{r.negatif ?? "—"}</td>
                    <td className={`${tdNum} font-semibold`}>
                      {r.pourcentage != null ? `${r.pourcentage.toFixed(2)} %` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </div>
        </section>
      )}
    </div>
  );
}
