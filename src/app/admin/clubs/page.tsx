import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guards";
import { ClubForm } from "@/components/admin/ClubForm";
import { ClubRow } from "@/components/admin/ClubRow";

const PAGE_SIZE = 50;

export default async function AdminClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const { q, page: pageParam } = await searchParams;
  const query = q?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const where: Prisma.ClubWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { code: { contains: query, mode: "insensitive" } },
        ],
      }
    : {};

  const [clubs, total] = await Promise.all([
    prisma.club.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { players: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.club.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-navy dark:text-navy-light mb-4">Clubs ({total})</h1>
        <ClubForm />
      </div>

      <form className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-xs font-medium">
            Rechercher (nom ou code)
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm min-w-64"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-black/10 dark:border-white/20 px-4 py-2 text-sm font-medium"
        >
          Rechercher
        </button>
      </form>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pr-4">Club</th>
            <th className="py-2 pr-4">Joueurs</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {clubs.map((club) => (
            <ClubRow
              key={club.id}
              club={{
                id: club.id,
                name: club.name,
                code: club.code,
                city: club.city,
                federation: club.federation,
                playerCount: club._count.players,
              }}
            />
          ))}
          {clubs.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-black/50 dark:text-white/50">
                Aucun club ne correspond à cette recherche.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link
              href={`/admin/clubs?${new URLSearchParams({ q: query, page: String(page - 1) })}`}
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
              href={`/admin/clubs?${new URLSearchParams({ q: query, page: String(page + 1) })}`}
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
