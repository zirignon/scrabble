import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Pill, card, cardHover } from "@/components/public/StatusPill";

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

const statusTone: Record<string, "moss" | "gold" | "muted"> = {
  REGISTRATION_OPEN: "moss",
  REGISTRATION_CLOSED: "gold",
  IN_PROGRESS: "gold",
  COMPLETED: "muted",
  ARCHIVED: "muted",
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

      <div className="flex flex-col gap-3">
        {tournaments.map((t) => (
          <Link
            key={t.id}
            href={`/tournois/${t.slug}`}
            className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 ${card} ${cardHover}`}
          >
            <div className="min-w-0">
              <p className="font-medium">{t.name}</p>
              <p className="text-xs text-black/60 dark:text-white/60 mt-0.5">
                {typeLabel[t.type]} · {t._count.registrations} inscrit(s)
                {t.venue ? ` · ${t.venue}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Pill tone={statusTone[t.status] ?? "muted"}>
                {statusLabel[t.status] ?? t.status}
              </Pill>
              <span className="text-xs text-black/40 dark:text-white/40 whitespace-nowrap">
                {new Date(t.startDate).toLocaleDateString("fr-FR")}
              </span>
            </div>
          </Link>
        ))}
        {tournaments.length === 0 && (
          <p className={`px-4 py-6 text-sm text-black/50 dark:text-white/50 ${card}`}>
            Aucun tournoi publié pour le moment.
          </p>
        )}
      </div>
    </div>
  );
}
