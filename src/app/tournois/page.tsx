import Link from "next/link";
import { prisma } from "@/lib/prisma";

const typeLabel: Record<string, string> = {
  CLASSIC: "Classique",
  DUPLICATE: "Duplicate",
};

const statusLabel: Record<string, string> = {
  REGISTRATION_OPEN: "Inscriptions ouvertes",
  REGISTRATION_CLOSED: "Inscriptions fermées",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminé",
  ARCHIVED: "Archivé",
};

export default async function TournamentsListPage() {
  const tournaments = await prisma.tournament.findMany({
    where: { status: { not: "DRAFT" } },
    orderBy: { startDate: "desc" },
    include: { _count: { select: { registrations: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl w-full px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold text-navy dark:text-navy-light mb-6">
        Tous les tournois
      </h1>

      <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5 border border-black/10 dark:border-white/10 rounded-lg overflow-hidden">
        {tournaments.map((t) => (
          <Link
            key={t.id}
            href={`/tournois/${t.slug}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-navy/[.04] dark:hover:bg-navy-light/[.08] transition-colors"
          >
            <div>
              <p className="font-medium">{t.name}</p>
              <p className="text-xs text-black/60 dark:text-white/60">
                {typeLabel[t.type]} · {statusLabel[t.status] ?? t.status} ·{" "}
                {t._count.registrations} inscrit(s)
                {t.venue ? ` · ${t.venue}` : ""}
              </p>
            </div>
            <span className="text-xs text-black/40 dark:text-white/40">
              {new Date(t.startDate).toLocaleDateString("fr-FR")}
            </span>
          </Link>
        ))}
        {tournaments.length === 0 && (
          <p className="px-4 py-6 text-sm text-black/50 dark:text-white/50">
            Aucun tournoi publié pour le moment.
          </p>
        )}
      </div>
    </div>
  );
}
