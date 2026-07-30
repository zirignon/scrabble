import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/Logo";

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
      <section className="relative overflow-hidden bg-emerald-50 dark:bg-emerald-950/20 border-b border-black/10 dark:border-white/10">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full text-navy dark:text-navy-light"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="tile-grid"
              width="34"
              height="34"
              patternUnits="userSpaceOnUse"
            >
              <rect
                x="1"
                y="1"
                width="28"
                height="28"
                rx="4"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.08"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#tile-grid)" />
        </svg>
        <Logo
          size={220}
          className="pointer-events-none absolute -right-10 -top-10 opacity-[0.05] dark:opacity-[0.08] hidden sm:block"
        />
        <div className="relative mx-auto max-w-5xl px-4 py-16 flex flex-col gap-4">
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold max-w-2xl">
            Gérez vos tournois de Scrabble, classique et duplicate
          </h1>
          <p className="max-w-xl text-black/70 dark:text-white/70">
            Inscriptions, rondes, appariements, saisie des scores et classements
            en direct — pour les organisateurs, arbitres, joueurs et spectateurs.
          </p>
          <div className="flex gap-3 mt-2">
            <Link
              href="/tournois"
              className="rounded-md bg-emerald-700 text-white px-5 py-2.5 font-medium"
            >
              Voir les tournois
            </Link>
            <Link
              href="/register"
              className="rounded-md border border-black/10 dark:border-white/20 px-5 py-2.5 font-medium"
            >
              Créer un compte
            </Link>
          </div>
          <p className="text-xs text-black/50 dark:text-white/50 mt-2">
            {stats} tournoi(s) géré(s) sur la plateforme.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl w-full px-4 py-10 flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold">Tournois à venir</h2>
        <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5 border border-black/10 dark:border-white/10 rounded-lg overflow-hidden">
          {upcoming.map((t) => (
            <Link
              key={t.id}
              href={`/tournois/${t.slug}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-navy/[.04] dark:hover:bg-navy-light/[.08] transition-colors"
            >
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-black/60 dark:text-white/60">
                  {t.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"}
                  {t.venue ? ` · ${t.venue}` : ""}
                </p>
              </div>
              <span className="text-xs text-black/40 dark:text-white/40">
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
