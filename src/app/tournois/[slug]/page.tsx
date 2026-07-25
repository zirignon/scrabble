import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { selfRegisterAction } from "@/lib/actions/tournaments";
import { tournamentStatusLabel } from "@/lib/labels";

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
        <p className="text-sm text-black/50 dark:text-white/50">
          {tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"}
          {" · "}
          {tournamentStatusLabel[tournament.status]}
        </p>
        <h1 className="font-heading text-3xl font-semibold">{tournament.name}</h1>
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
              className="rounded-md bg-navy text-white px-4 py-2 text-sm font-medium"
            >
              S&apos;inscrire à ce tournoi
            </button>
          </form>
        )}
        {session && isRegistered && (
          <p className="mt-4 text-sm text-navy dark:text-navy-light">
            Vous êtes inscrit à ce tournoi.
          </p>
        )}
      </div>

      <nav className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href={`/tournois/${tournament.slug}/participants`}
          className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 hover:bg-navy/[0.03] dark:hover:bg-white/[0.04] transition-colors"
        >
          <p className="font-medium">👥 Participants</p>
          <p className="text-xs text-black/60 dark:text-white/60">
            {tournament._count.registrations} inscrit(s)
          </p>
        </Link>
        <Link
          href={`/tournois/${tournament.slug}/classement`}
          className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 hover:bg-navy/[0.03] dark:hover:bg-white/[0.04] transition-colors"
        >
          <p className="font-medium">🏆 Classement</p>
        </Link>
        <Link
          href={`/tournois/${tournament.slug}/${tournament.type === "CLASSIC" ? "rondes" : "parties"}`}
          className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 hover:bg-navy/[0.03] dark:hover:bg-white/[0.04] transition-colors"
        >
          <p className="font-medium">
            {tournament.type === "CLASSIC" ? "📋 Rondes & résultats" : "🁢 Parties & scores"}
          </p>
        </Link>
        <Link
          href={`/tournois/${tournament.slug}/affichage`}
          target="_blank"
          className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 hover:bg-navy/[0.03] dark:hover:bg-white/[0.04] transition-colors"
        >
          <p className="font-medium">📺 Affichage grand écran</p>
        </Link>
      </nav>
    </div>
  );
}
