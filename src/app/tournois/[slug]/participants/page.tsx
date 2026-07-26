import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { tournamentStatusLabel } from "@/lib/labels";
import { headRow, th, matchRow, matchCell, exportLink } from "@/components/public/StatusPill";

export default async function TournamentParticipantsPage({
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
    },
  });
  if (!tournament) notFound();

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
          {tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"}
          {" · "}
          {tournamentStatusLabel[tournament.status]}
        </p>
        <h1 className="font-heading text-3xl font-semibold">
          Participants — {tournament.name}
        </h1>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-xl font-semibold">
            {tournament.registrations.length} inscrit(s)
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
                {tournament.type === "DUPLICATE" && <th className={th}>Table</th>}
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
                  {tournament.type === "DUPLICATE" && (
                    <td className={`${matchCell} tabular-nums`}>{r.tableNumber ?? "—"}</td>
                  )}
                </tr>
              ))}
              {tournament.registrations.length === 0 && (
                <tr>
                  <td
                    colSpan={tournament.type === "DUPLICATE" ? 6 : 5}
                    className="py-4 text-black/50 dark:text-white/50"
                  >
                    Aucun participant inscrit.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
