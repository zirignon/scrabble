import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const [upcoming, stats] = await Promise.all([
    prisma.tournament.findMany({
      where: { status: { in: ["REGISTRATION_OPEN", "IN_PROGRESS"] } },
      orderBy: { startDate: "asc" },
      take: 5,
    }),
    prisma.tournament.count(),
  ]);

  return (
    <div className="flex flex-col flex-1">
      <section className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20 flex flex-col gap-5">
          <span className="w-fit rounded-full border border-navy/15 bg-white/60 px-3 py-1 text-xs font-semibold tracking-wide text-navy shadow-sm backdrop-blur dark:border-navy-light/30 dark:bg-white/5 dark:text-navy-light">
            TOURNOIS CLASSIQUE &amp; DUPLICATE
          </span>
          <h1 className="font-heading text-4xl leading-[1.08] sm:text-5xl font-semibold max-w-3xl text-navy dark:text-white">
            Gérez vos tournois de Scrabble, classique et duplicate
          </h1>
          <p className="max-w-2xl text-base leading-7 text-black/70 dark:text-white/70">
            Inscriptions, rondes, appariements, saisie des scores et classements
            en direct — pour les organisateurs, arbitres, joueurs et spectateurs.
          </p>
          <div className="flex flex-wrap gap-3 mt-2">
            <Link
              href="/tournois"
              className="rounded-full bg-emerald-700 px-5 py-2.5 font-medium text-white shadow-md shadow-emerald-950/15 transition-all duration-200 hover:-translate-y-px hover:bg-emerald-800 hover:shadow-lg"
            >
              Voir les tournois
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-navy px-5 py-2.5 font-medium text-white shadow-md shadow-navy/15 transition-all duration-200 hover:-translate-y-px hover:bg-navy/90 hover:shadow-lg dark:bg-navy-light dark:text-navy dark:hover:bg-navy-light/90"
            >
              Créer un compte
            </Link>
          </div>
          <p className="text-xs text-black/50 dark:text-white/50 mt-2">
            {stats} tournoi(s) géré(s) sur la plateforme.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl w-full px-4 py-10 sm:py-14 flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-navy/70 dark:text-navy-light">À L’AGENDA</p>
            <h2 className="font-heading text-2xl font-semibold">Tournois à venir</h2>
          </div>
          <span className="hidden sm:block text-sm text-black/50 dark:text-white/50">Les cinq prochains événements</span>
        </div>
        <div className="flex flex-col divide-y divide-black/5 overflow-hidden rounded-xl border border-black/10 bg-white/70 shadow-sm backdrop-blur-sm dark:divide-white/5 dark:border-white/10 dark:bg-white/[0.035]">
          {upcoming.map((t) => (
            <Link
              key={t.id}
              href={`/tournois/${t.slug}`}
              className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-navy/[.05] dark:hover:bg-navy-light/[.08]"
            >
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-black/60 dark:text-white/60">
                  {t.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"}
                  {t.venue ? ` · ${t.venue}` : ""}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-navy/[.06] px-2.5 py-1 text-xs font-medium text-navy/80 dark:bg-navy-light/[.12] dark:text-navy-light">
                {new Date(t.startDate).toLocaleDateString("fr-FR")}
              </span>
            </Link>
          ))}
          {upcoming.length === 0 && (
            <p className="px-4 py-6 text-sm text-black/50 dark:text-white/50">
              Aucun tournoi à venir pour le moment.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
