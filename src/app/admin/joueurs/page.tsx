import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, STAFF_ROLES } from "@/lib/guards";
import { deletePlayerAction } from "@/lib/actions/players";
import { PlayerForm } from "@/components/admin/PlayerForm";
import { PlayerImportForm } from "@/components/admin/PlayerImportForm";
import { PlayerListSearch } from "@/components/admin/PlayerListSearch";

const PAGE_SIZE = 50;

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireRole(STAFF_ROLES);
  const { q, page: pageParam } = await searchParams;
  const query = q?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const where: Prisma.PlayerWhereInput = query
    ? {
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { licenseNumber: { contains: query, mode: "insensitive" } },
        ],
      }
    : {};

  const [players, total, clubs] = await Promise.all([
    prisma.player.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: { club: true },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.player.count({ where }),
    prisma.club.findMany({ orderBy: { name: "asc" } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Joueurs ({total})</h1>
          <a
            href="/api/joueurs/export"
            className="rounded-md border border-black/10 dark:border-white/20 px-3 py-1.5 text-sm"
          >
            Exporter en CSV
          </a>
        </div>
        <PlayerForm clubs={clubs} />
        <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10">
          <PlayerImportForm />
        </div>
      </div>

      <PlayerListSearch initialQuery={query} />

      <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pr-4">Nom</th>
            <th className="py-2 pr-4">Club</th>
            <th className="py-2 pr-4">Licence</th>
            <th className="py-2 pr-4">Catégorie</th>
            <th className="py-2 pr-4">Série dupl.</th>
            <th className="py-2 pr-4">Elo dupl.</th>
            <th className="py-2 pr-4">Série class.</th>
            <th className="py-2 pr-4">Elo class.</th>
            <th className="py-2 pr-4">Coeff. class.</th>
            <th className="py-2 pr-4">Nat.</th>
            <th className="py-2 pr-4">Fédération</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.id} className="border-b border-black/5 dark:border-white/5">
              <td className="py-2 pr-4">
                {player.lastName} {player.firstName}
              </td>
              <td className="py-2 pr-4">{player.club?.name ?? "—"}</td>
              <td className="py-2 pr-4">{player.licenseNumber ?? "—"}</td>
              <td className="py-2 pr-4">{player.category ?? "—"}</td>
              <td className="py-2 pr-4">{player.classification ?? "—"}</td>
              <td className="py-2 pr-4">{player.eloDuplicate ?? "—"}</td>
              <td className="py-2 pr-4">{player.classificationClassic ?? "—"}</td>
              <td className="py-2 pr-4">{player.eloClassic ?? "—"}</td>
              <td className="py-2 pr-4">{player.coefficientClassic ?? "—"}</td>
              <td className="py-2 pr-4">{player.nationality ?? "—"}</td>
              <td className="py-2 pr-4">{player.federation ?? "—"}</td>
              <td className="py-2 pr-4 text-right">
                <form action={deletePlayerAction.bind(null, player.id)}>
                  <button type="submit" className="text-red-600 hover:underline">
                    Supprimer
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {players.length === 0 && (
            <tr>
              <td colSpan={12} className="py-4 text-black/50 dark:text-white/50">
                Aucun joueur ne correspond à cette recherche.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link
              href={`/admin/joueurs?${new URLSearchParams({ q: query, page: String(page - 1) })}`}
              className="underline"
            >
              ← Précédent
            </Link>
          )}
          <span className="text-black/60 dark:text-white/60">
            Page {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/admin/joueurs?${new URLSearchParams({ q: query, page: String(page + 1) })}`}
              className="underline"
            >
              Suivant →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
