import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { selfRegisterAction } from "@/lib/actions/tournaments";
import { tournamentStatusLabel } from "@/lib/labels";
import { Pill, card, cardHover } from "@/components/public/StatusPill";

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-navy/10 dark:bg-navy-light/15 text-lg">
      {children}
    </span>
  );
}

export default async function TournamentPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: {
      _count: { select: { registrations: true } },
    },
  });
  if (!tournament) notFound();

  const session = await getSession();
  let isRegistered = false;
  let hasPlayerProfile = false;
  if (session) {
    const player = await prisma.player.findUnique({
      where: { userId: session.userId },
    });
    hasPlayerProfile = !!player;
    if (player) {
      isRegistered = !!(await prisma.registration.findUnique({
        where: { tournamentId_playerId: { tournamentId: tournament.id, playerId: player.id } },
      }));
    }
  }

  return (
    <div className="mx-auto max-w-4xl w-full px-4 py-10 flex flex-col gap-8">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-black/50 dark:text-white/50">
            {tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"}
          </p>
          <Pill tone={tournament.status === "REGISTRATION_OPEN" ? "moss" : "gold"}>
            {tournamentStatusLabel[tournament.status]}
          </Pill>
        </div>
        <h1 className="font-heading text-3xl font-semibold mt-1 tracking-tight">{tournament.name}</h1>
        <p className="text-sm text-black/60 dark:text-white/60 mt-2">
          {new Date(tournament.startDate).toLocaleDateString("fr-FR")}
          {tournament.endDate &&
            ` — ${new Date(tournament.endDate).toLocaleDateString("fr-FR")}`}
          {tournament.venue ? ` · ${tournament.venue}` : ""}
        </p>
        {tournament.description && (
          <p className="mt-3 max-w-2xl text-black/80 dark:text-white/80">
            {tournament.description}
          </p>
        )}

        {session && hasPlayerProfile && !isRegistered && tournament.status === "REGISTRATION_OPEN" && (
          <form action={selfRegisterAction.bind(null, tournament.id)} className="mt-4">
            <button
              type="submit"
              className="rounded-full bg-navy text-white px-5 py-2.5 text-sm font-medium shadow-md shadow-navy/20 hover:bg-navy/90 hover:shadow-lg hover:shadow-navy/25 hover:-translate-y-0.5 transition-all"
            >
              S&apos;inscrire à ce tournoi
            </button>
          </form>
        )}
        {session && isRegistered && (
          <p className="mt-4 text-sm text-navy dark:text-navy-light font-medium">
            ✓ Vous êtes inscrit à ce tournoi.
          </p>
        )}
      </div>

      <nav className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href={`/tournois/${tournament.slug}/participants`}
          className={`flex flex-col gap-2 px-4 py-4 ${card} ${cardHover}`}
        >
          <NavIcon>👥</NavIcon>
          <p className="font-medium">Participants</p>
          <p className="text-xs text-black/60 dark:text-white/60">
            {tournament._count.registrations} inscrit(s)
          </p>
        </Link>
        <Link
          href={`/tournois/${tournament.slug}/classement`}
          className={`flex flex-col gap-2 px-4 py-4 ${card} ${cardHover}`}
        >
          <NavIcon>🏆</NavIcon>
          <p className="font-medium">Classement</p>
        </Link>
        <Link
          href={`/tournois/${tournament.slug}/${tournament.type === "CLASSIC" ? "rondes" : "parties"}`}
          className={`flex flex-col gap-2 px-4 py-4 ${card} ${cardHover}`}
        >
          <NavIcon>{tournament.type === "CLASSIC" ? "📋" : "🁢"}</NavIcon>
          <p className="font-medium">
            {tournament.type === "CLASSIC" ? "Rondes & résultats" : "Parties & scores"}
          </p>
        </Link>
        <Link
          href={`/tournois/${tournament.slug}/affichage`}
          target="_blank"
          className={`flex flex-col gap-2 px-4 py-4 ${card} ${cardHover}`}
        >
          <NavIcon>📺</NavIcon>
          <p className="font-medium">Affichage grand écran</p>
        </Link>
      </nav>
    </div>
  );
}
