import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, STAFF_ROLES } from "@/lib/guards";
import { computeGameClassementSheet } from "@/lib/duplicate/gameSheet";

export default async function GameClassementPage({
  params,
}: {
  params: Promise<{ id: string; gameId: string }>;
}) {
  const { id, gameId } = await params;
  await requireRole(STAFF_ROLES);

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament || tournament.type !== "DUPLICATE") notFound();

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || game.tournamentId !== tournament.id) notFound();

  const { rows, games, cumulTop } = await computeGameClassementSheet(gameId);
  const showCumul = games.length >= 2;
  const identityColumns = 9;
  const colSpan = identityColumns + (showCumul ? 1 : 0) + 2 + games.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/admin/tournois/${tournament.id}/parties`}
          className="text-sm text-black/60 dark:text-white/60 hover:underline"
        >
          ← Retour aux parties
        </Link>
        <h1 className="text-2xl font-semibold mt-1">
          Fiche de classement — {tournament.name}, partie {game.number}
        </h1>
        <div className="flex gap-3 mt-2">
          <a
            href={`/api/tournois/${tournament.id}/parties/${game.id}/classement/export`}
            className="text-sm text-emerald-700 dark:text-emerald-400 underline"
          >
            Exporter en CSV
          </a>
          <a
            href={`/api/tournois/${tournament.id}/parties/${game.id}/classement/export/pdf`}
            className="text-sm text-emerald-700 dark:text-emerald-400 underline"
          >
            Exporter en PDF
          </a>
        </div>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pr-4">Rang</th>
            <th className="py-2 pr-4">Nom</th>
            <th className="py-2 pr-4">Prénom</th>
            <th className="py-2 pr-4">N° licence</th>
            <th className="py-2 pr-4">Catégorie</th>
            <th className="py-2 pr-4">Classification</th>
            <th className="py-2 pr-4">Club</th>
            <th className="py-2 pr-4">Fédération</th>
            <th className="py-2 pr-4">Nat.</th>
            {showCumul && <th className="py-2 pr-4">Cumul</th>}
            <th className="py-2 pr-4">Négatif</th>
            <th className="py-2 pr-4">%</th>
            {games.map((g) => (
              <th key={g.gameNumber} className="py-2 pr-4">
                P{g.gameNumber}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {games.length > 0 && (
            <tr className="border-b border-black/10 dark:border-white/10 text-black/50 dark:text-white/50 text-xs">
              <td className="py-2 pr-4" colSpan={identityColumns}>
                Top
              </td>
              {showCumul && <td className="py-2 pr-4">{cumulTop ?? "—"}</td>}
              <td className="py-2 pr-4">—</td>
              <td className="py-2 pr-4">—</td>
              {games.map((g) => (
                <td key={g.gameNumber} className="py-2 pr-4">
                  {g.top ?? "—"}
                </td>
              ))}
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={row.playerId} className="border-b border-black/5 dark:border-white/5">
              <td className="py-2 pr-4">{i + 1}</td>
              <td className="py-2 pr-4">{row.lastName}</td>
              <td className="py-2 pr-4">{row.firstName}</td>
              <td className="py-2 pr-4">{row.licenseNumber ?? "—"}</td>
              <td className="py-2 pr-4">{row.category ?? "—"}</td>
              <td className="py-2 pr-4">{row.classification ?? "—"}</td>
              <td className="py-2 pr-4">{row.clubName ?? "—"}</td>
              <td className="py-2 pr-4">{row.federation ?? "—"}</td>
              <td className="py-2 pr-4">{row.nationality ?? "—"}</td>
              {showCumul && <td className="py-2 pr-4 font-medium">{row.cumul}</td>}
              <td className="py-2 pr-4">{row.negatif ?? "—"}</td>
              <td className="py-2 pr-4">
                {row.pourcentage != null ? `${row.pourcentage.toFixed(2)} %` : "—"}
              </td>
              {games.map((g) => (
                <td key={g.gameNumber} className="py-2 pr-4 font-medium">
                  {row.perGame[g.gameNumber] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="py-4 text-black/50 dark:text-white/50">
                Aucun score saisi pour cette partie.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
