import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole, STAFF_ROLES } from "@/lib/guards";

const typeLabel: Record<string, string> = {
  CLASSIC: "Classique",
  DUPLICATE: "Duplicate",
};

const statusLabel: Record<string, string> = {
  DRAFT: "Brouillon",
  REGISTRATION_OPEN: "Inscriptions ouvertes",
  REGISTRATION_CLOSED: "Inscriptions fermées",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminé",
  ARCHIVED: "Archivé",
};

export default async function AdminDashboardPage() {
  await requireRole(STAFF_ROLES);

  const tournaments = await prisma.tournament.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { registrations: true } }, organizer: true },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Tableau de bord</h1>
        <Link
          href="/admin/tournois/nouveau"
          className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
        >
          + Nouveau tournoi
        </Link>
      </div>

      <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5 border border-black/10 dark:border-white/10 rounded-lg overflow-hidden">
        {tournaments.map((tournament) => (
          <Link
            key={tournament.id}
            href={`/admin/tournois/${tournament.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-black/[.02] dark:hover:bg-white/[.04]"
          >
            <div>
              <p className="font-medium">{tournament.name}</p>
              <p className="text-xs text-black/60 dark:text-white/60">
                {typeLabel[tournament.type]} · {statusLabel[tournament.status]} ·{" "}
                {tournament._count.registrations} inscrit(s) · organisé par{" "}
                {tournament.organizer.name}
              </p>
            </div>
            <span className="text-xs text-black/40 dark:text-white/40">
              {new Date(tournament.startDate).toLocaleDateString("fr-FR")}
            </span>
          </Link>
        ))}
        {tournaments.length === 0 && (
          <p className="px-4 py-6 text-sm text-black/50 dark:text-white/50">
            Aucun tournoi pour le moment. Créez-en un pour commencer.
          </p>
        )}
      </div>
    </div>
  );
}
