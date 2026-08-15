import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Pill, card, cardHover } from "@/components/public/StatusPill";

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
      <section className="relative overflow-hidden border-b border-black/10 dark:border-white/10">
        {/* Halo doux navy/or derrière le titre, purement décoratif — reprend
            la palette existante sans introduire de nouvelle couleur. */}
        <div
          className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-navy/10 dark:bg-navy-light/10 blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-32 right-0 w-96 h-96 rounded-full bg-gold/10 dark:bg-gold-light/10 blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:py-20 flex flex-col gap-4">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-navy/10 dark:bg-navy-light/15 text-navy dark:text-navy-light text-xs font-semibold px-3 py-1">
            Plateforme de gestion de tournois
          </span>
          <h1 className="font-heading text-3xl sm:text-4xl md:text-5xl font-semibold max-w-2xl tracking-tight">
            Gérez vos tournois de Scrabble, classique et duplicate
          </h1>
          <p className="max-w-xl text-black/70 dark:text-white/70 text-base sm:text-lg">
            Inscriptions, rondes, appariements, saisie des scores et classements
            en direct — pour les organisateurs, arbitres, joueurs et spectateurs.
          </p>
          <div className="flex gap-3 mt-2">
            <Link
              href="/tournois"
              className="rounded-full bg-emerald-700 text-white px-5 py-2.5 font-medium shadow-md shadow-emerald-900/20 hover:bg-emerald-800 hover:shadow-lg hover:shadow-emerald-900/25 hover:-translate-y-0.5 transition-all"
            >
              Voir les tournois
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-navy hover:bg-navy/90 text-white dark:bg-navy-light dark:hover:bg-navy-light/90 dark:text-navy px-5 py-2.5 font-medium shadow-md shadow-navy/20 hover:shadow-lg hover:shadow-navy/25 hover:-translate-y-0.5 transition-all"
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
        <h2 className="font-heading text-xl font-semibold">Tournois à venir</h2>
        <div className="flex flex-col gap-3">
          {upcoming.map((t) => {
            const date = new Date(t.startDate);
            return (
              <Link
                key={t.id}
                href={`/tournois/${t.slug}`}
                className={`flex items-center gap-4 px-4 py-3.5 ${card} ${cardHover}`}
              >
                <div className="flex flex-col items-center justify-center w-14 h-14 shrink-0 rounded-lg bg-navy/5 dark:bg-navy-light/10 text-navy dark:text-navy-light">
                  <span className="text-lg font-heading font-semibold leading-none">
                    {date.toLocaleDateString("fr-FR", { day: "2-digit" })}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide font-medium mt-0.5">
                    {date.toLocaleDateString("fr-FR", { month: "short" })}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t.name}</p>
                  <p className="text-xs text-black/60 dark:text-white/60 truncate">
                    {t.venue ?? (t.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate")}
                  </p>
                </div>
                <Pill tone={t.type === "CLASSIC" ? "moss" : "gold"}>
                  {t.type === "CLASSIC" ? "Classique" : "Duplicate"}
                </Pill>
              </Link>
            );
          })}
          {upcoming.length === 0 && (
            <p className={`px-4 py-6 text-sm text-black/50 dark:text-white/50 ${card}`}>
              Aucun tournoi à venir pour le moment.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
