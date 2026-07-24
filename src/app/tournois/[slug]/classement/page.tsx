import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computeClassicStandings } from "@/lib/classic/standings";
import { computeDuplicateStandings } from "@/lib/duplicate/standings";
import { computeClassicTeamStandings } from "@/lib/classic/teamStandings";
import { computeDuplicateTeamStandings } from "@/lib/duplicate/teamStandings";
import { computeClassicPoolStandings } from "@/lib/classic/poolStandings";
import { computeClassicTeamPoolStandings } from "@/lib/classic/teamPoolStandings";

const statusLabel: Record<string, string> = {
  DRAFT: "Brouillon",
  REGISTRATION_OPEN: "Inscriptions ouvertes",
  REGISTRATION_CLOSED: "Inscriptions fermées",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminé",
  ARCHIVED: "Archivé",
};

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
  const duplicateStandings =
    tournament.type === "DUPLICATE" ? await computeDuplicateStandings(tournament.id) : [];
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
          {statusLabel[tournament.status]}
        </p>
        <h1 className="text-3xl font-semibold">Classement — {tournament.name}</h1>
      </div>

      {!(tournament.type === "CLASSIC" && tournament.format === "GROUPS") && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Classement</h2>
            <div className="flex gap-3">
              <a
                href={`/api/tournois/${tournament.id}/classement/export`}
                className="text-sm text-emerald-700 dark:text-emerald-400 underline"
              >
                Exporter en CSV
              </a>
              <a
                href={`/api/tournois/${tournament.id}/classement/export/pdf`}
                className="text-sm text-emerald-700 dark:text-emerald-400 underline"
              >
                Exporter en PDF
              </a>
            </div>
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
                  <th className="py-2 pr-4" title="Buchholz médian">Bchz méd.</th>
                  <th className="py-2 pr-4" title="Sonneborn-Berger">SB</th>
                  <th className="py-2 pr-4" title="Score cumulé progressif">Cumul</th>
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
                    <td className="py-2 pr-4">{row.buchholzMedian}</td>
                    <td className="py-2 pr-4">{row.sonnebornBerger}</td>
                    <td className="py-2 pr-4">{row.cumulativeScore}</td>
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
      )}

      {tournament.type === "CLASSIC" && tournament.format === "GROUPS" && !tournament.isTeamEvent && (
        <section>
          <h2 className="text-xl font-semibold mb-3">Classement par poule</h2>
          <div className="flex flex-col gap-6">
            {poolStandings.map(({ poolId, poolName, standings }) => (
              <div key={poolId}>
                <h3 className="font-medium mb-2">{poolName}</h3>
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
                      <th className="py-2 pr-4" title="Buchholz médian">Bchz méd.</th>
                      <th className="py-2 pr-4" title="Sonneborn-Berger">SB</th>
                      <th className="py-2 pr-4" title="Score cumulé progressif">Cumul</th>
                      <th className="py-2 pr-4">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row, i) => (
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
                        <td className="py-2 pr-4">{row.buchholzMedian}</td>
                        <td className="py-2 pr-4">{row.sonnebornBerger}</td>
                        <td className="py-2 pr-4">{row.cumulativeScore}</td>
                        <td className="py-2 pr-4">{row.diff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          <h2 className="text-xl font-semibold mb-3">Classement par poule (équipes)</h2>
          <div className="flex flex-col gap-6">
            {teamPoolStandings.map(({ poolId, poolName, standings }) => (
              <div key={poolId}>
                <h3 className="font-medium mb-2">{poolName}</h3>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left border-b border-black/10 dark:border-white/10">
                      <th className="py-2 pr-4">#</th>
                      <th className="py-2 pr-4">Équipe</th>
                      <th className="py-2 pr-4">J</th>
                      <th className="py-2 pr-4">V</th>
                      <th className="py-2 pr-4">N</th>
                      <th className="py-2 pr-4">D</th>
                      <th className="py-2 pr-4">Pts</th>
                      <th className="py-2 pr-4" title="Échiquiers gagnés/nuls/perdus">
                        Éch. G/N/P
                      </th>
                      <th className="py-2 pr-4">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row, i) => (
                      <tr key={row.teamId} className="border-b border-black/5 dark:border-white/5">
                        <td className="py-2 pr-4">{i + 1}</td>
                        <td className="py-2 pr-4">{row.name}</td>
                        <td className="py-2 pr-4">{row.played}</td>
                        <td className="py-2 pr-4">{row.wins}</td>
                        <td className="py-2 pr-4">{row.draws}</td>
                        <td className="py-2 pr-4">{row.losses}</td>
                        <td className="py-2 pr-4 font-medium">{row.matchPoints}</td>
                        <td className="py-2 pr-4">
                          {row.boardsWon}/{row.boardsDrawn}/{row.boardsLost}
                        </td>
                        <td className="py-2 pr-4">{row.diff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
            <h2 className="text-xl font-semibold">Classement par équipes</h2>
            <div className="flex gap-3">
              <a
                href={`/api/tournois/${tournament.id}/classement/equipes/export`}
                className="text-sm text-emerald-700 dark:text-emerald-400 underline"
              >
                Exporter en CSV
              </a>
              <a
                href={`/api/tournois/${tournament.id}/classement/equipes/export/pdf`}
                className="text-sm text-emerald-700 dark:text-emerald-400 underline"
              >
                Exporter en PDF
              </a>
            </div>
          </div>
          {tournament.type === "CLASSIC" ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Équipe</th>
                  <th className="py-2 pr-4">J</th>
                  <th className="py-2 pr-4">V</th>
                  <th className="py-2 pr-4">N</th>
                  <th className="py-2 pr-4">D</th>
                  <th className="py-2 pr-4">Pts</th>
                  <th className="py-2 pr-4" title="Échiquiers gagnés/nuls/perdus">
                    Éch. G/N/P
                  </th>
                  <th className="py-2 pr-4">Diff</th>
                </tr>
              </thead>
              <tbody>
                {classicTeamStandings.map((row, i) => (
                  <tr key={row.teamId} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-4">{i + 1}</td>
                    <td className="py-2 pr-4">{row.name}</td>
                    <td className="py-2 pr-4">{row.played}</td>
                    <td className="py-2 pr-4">{row.wins}</td>
                    <td className="py-2 pr-4">{row.draws}</td>
                    <td className="py-2 pr-4">{row.losses}</td>
                    <td className="py-2 pr-4 font-medium">{row.matchPoints}</td>
                    <td className="py-2 pr-4">
                      {row.boardsWon}/{row.boardsDrawn}/{row.boardsLost}
                    </td>
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
                  <th className="py-2 pr-4">Équipe</th>
                  <th className="py-2 pr-4">Parties</th>
                  <th className="py-2 pr-4">Score total</th>
                  <th className="py-2 pr-4">Pénalités</th>
                  <th className="py-2 pr-4">Net</th>
                  <th className="py-2 pr-4">Négatif</th>
                  <th className="py-2 pr-4">%</th>
                </tr>
              </thead>
              <tbody>
                {duplicateTeamStandings.map((row, i) => (
                  <tr key={row.teamId} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-4">{i + 1}</td>
                    <td className="py-2 pr-4">{row.name}</td>
                    <td className="py-2 pr-4">{row.gamesPlayed}</td>
                    <td className="py-2 pr-4">{row.totalScore}</td>
                    <td className="py-2 pr-4">{row.totalPenalty}</td>
                    <td className="py-2 pr-4">{row.net}</td>
                    <td className="py-2 pr-4">{row.negatif ?? "—"}</td>
                    <td className="py-2 pr-4 font-medium">
                      {row.pourcentage != null ? `${row.pourcentage.toFixed(2)} %` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
