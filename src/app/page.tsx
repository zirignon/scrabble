import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Pill, card, cardHover } from "@/components/public/StatusPill";

// Valeurs des lettres au Scrabble francophone — juste pour la petite
// pastille de points sur chaque tuile décorative (voir ScrabbleTiles),
// aucune incidence sur le jeu lui-même.
const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 10, L: 1,
  M: 2, N: 1, O: 1, P: 3, Q: 8, R: 1, S: 1, T: 1, U: 1, V: 4, W: 10, X: 10,
  Y: 10, Z: 10,
};

// Couleurs purement décoratives, volontairement distinctes de la palette de
// statut (navy/gold/moss/brick, réservée au sens — voir globals.css) : ces
// tuiles n'indiquent rien, elles ne font qu'égayer l'accroche.
const TILE_ACCENTS = [
  "bg-navy text-white dark:bg-navy-light dark:text-navy",
  "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-emerald-950",
  "bg-sky-700 text-white dark:bg-sky-500 dark:text-sky-950",
  "bg-violet-700 text-white dark:bg-violet-500 dark:text-violet-950",
  "bg-amber-600 text-white dark:bg-amber-400 dark:text-amber-950",
  "bg-rose-700 text-white dark:bg-rose-500 dark:text-rose-950",
  "bg-teal-700 text-white dark:bg-teal-500 dark:text-teal-950",
  "bg-fuchsia-700 text-white dark:bg-fuchsia-500 dark:text-fuchsia-950",
];

function ScrabbleTiles({ word }: { word: string }) {
  return (
    <div className="flex gap-2 sm:gap-2.5 flex-wrap" aria-hidden="true">
      {word.split("").map((letter, i) => (
        <div
          key={i}
          className={`tile-float relative w-9 h-9 sm:w-11 sm:h-11 rounded-lg shadow-md flex items-center justify-center font-heading font-bold text-base sm:text-lg ${TILE_ACCENTS[i % TILE_ACCENTS.length]}`}
          style={{
            // @ts-expect-error -- propriété CSS personnalisée
            "--tile-rotate": `${(i % 2 === 0 ? -1 : 1) * (3 + (i % 3) * 2)}deg`,
            animationDelay: `${i * 0.15}s`,
          }}
        >
          {letter}
          <span className="absolute bottom-0.5 right-1 text-[8px] sm:text-[9px] font-sans font-semibold leading-none opacity-80">
            {LETTER_VALUES[letter] ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

const statAccents = {
  navy: "bg-navy/10 dark:bg-navy-light/15 text-navy dark:text-navy-light ring-navy/15 dark:ring-navy-light/20",
  emerald:
    "bg-emerald-700/10 dark:bg-emerald-400/15 text-emerald-700 dark:text-emerald-400 ring-emerald-700/15 dark:ring-emerald-400/20",
  sky: "bg-sky-700/10 dark:bg-sky-400/15 text-sky-700 dark:text-sky-400 ring-sky-700/15 dark:ring-sky-400/20",
} as const;

function StatCard({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent: keyof typeof statAccents;
}) {
  return (
    <div
      className={`rounded-xl px-4 py-5 sm:py-6 flex flex-col items-center text-center gap-1 ring-1 ${statAccents[accent]}`}
    >
      <span className="font-heading text-2xl sm:text-3xl font-bold tabular-nums">
        {value}
      </span>
      <span className="text-xs sm:text-sm font-medium opacity-80">{label}</span>
    </div>
  );
}

const featureAccents = {
  navy: "bg-navy/10 dark:bg-navy-light/15 text-navy dark:text-navy-light",
  emerald: "bg-emerald-700/10 dark:bg-emerald-400/15 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-600/10 dark:bg-amber-400/15 text-amber-700 dark:text-amber-400",
} as const;

function FeatureCard({
  accent,
  title,
  description,
  icon,
}: {
  accent: keyof typeof featureAccents;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`p-5 flex flex-col gap-3 ${card} ${cardHover}`}>
      <span
        className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${featureAccents[accent]}`}
      >
        {icon}
      </span>
      <h3 className="font-heading font-semibold">{title}</h3>
      <p className="text-sm text-black/60 dark:text-white/60">{description}</p>
    </div>
  );
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export default async function Home() {
  const [upcoming, tournamentCount, playerCount, clubCount] = await Promise.all([
    prisma.tournament.findMany({
      where: { status: { in: ["REGISTRATION_OPEN", "IN_PROGRESS"] } },
      orderBy: { startDate: "asc" },
      take: 5,
    }),
    prisma.tournament.count(),
    prisma.player.count(),
    prisma.club.count(),
  ]);

  return (
    <div className="flex flex-col flex-1">
      <section className="relative overflow-hidden border-b border-black/10 dark:border-white/10">
        {/* Halos décoratifs derrière le titre — un 3e (sky) en plus des
            navy/gold d'origine, pour une entrée plus vive sans toucher aux
            couleurs de statut. */}
        <div
          className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-navy/10 dark:bg-navy-light/10 blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-32 right-0 w-96 h-96 rounded-full bg-gold/10 dark:bg-gold-light/10 blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full bg-sky-500/10 dark:bg-sky-400/10 blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:py-20 flex flex-col gap-4">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-navy/10 dark:bg-navy-light/15 text-navy dark:text-navy-light text-xs font-semibold px-3 py-1">
            Plateforme de gestion de tournois
          </span>
          <ScrabbleTiles word="SCRABBLE" />
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
        </div>
      </section>

      <section className="mx-auto max-w-5xl w-full px-4 py-8 sm:py-10">
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <StatCard value={tournamentCount} label="Tournois gérés" accent="navy" />
          <StatCard value={playerCount} label="Joueurs inscrits" accent="emerald" />
          <StatCard value={clubCount} label="Clubs" accent="sky" />
        </div>
      </section>

      <section className="mx-auto max-w-5xl w-full px-4 py-8 sm:py-10 flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold">Tout pour organiser un tournoi</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <FeatureCard
            accent="navy"
            title="Scrabble classique"
            description="Suisse, poules, élimination directe — appariements et classements automatiques, revanches maîtrisées."
            icon={
              <svg {...iconProps}>
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            }
          />
          <FeatureCard
            accent="emerald"
            title="Scrabble duplicate"
            description="Saisie des coups, reconstitution du plateau et classement en temps réel, partie après partie."
            icon={
              <svg {...iconProps}>
                <rect x="7" y="7" width="12" height="12" rx="1.5" />
                <path d="M5 15V6a1 1 0 0 1 1-1h9" />
              </svg>
            }
          />
          <FeatureCard
            accent="amber"
            title="Suivi en direct"
            description="Écran public, classements et rondes actualisés en direct pour joueurs et spectateurs."
            icon={
              <svg {...iconProps}>
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v4l3 2" />
              </svg>
            }
          />
        </div>
      </section>

      <section className="mx-auto max-w-5xl w-full px-4 py-10 sm:py-14 flex flex-col gap-4">
        <h2 className="font-heading text-xl font-semibold">Tournois à venir</h2>
        <div className="flex flex-col gap-3">
          {upcoming.map((t) => {
            const date = new Date(t.startDate);
            const isClassic = t.type === "CLASSIC";
            return (
              <Link
                key={t.id}
                href={`/tournois/${t.slug}`}
                className={`flex items-center gap-4 px-4 py-3.5 ${card} ${cardHover}`}
              >
                <div
                  className={`flex flex-col items-center justify-center w-14 h-14 shrink-0 rounded-lg ${
                    isClassic
                      ? "bg-moss/10 dark:bg-moss-light/15 text-moss dark:text-moss-light"
                      : "bg-gold/10 dark:bg-gold-light/15 text-gold dark:text-gold-light"
                  }`}
                >
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
                    {t.venue ?? (isClassic ? "Scrabble classique" : "Scrabble duplicate")}
                  </p>
                </div>
                <Pill tone={isClassic ? "moss" : "gold"}>
                  {isClassic ? "Classique" : "Duplicate"}
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
