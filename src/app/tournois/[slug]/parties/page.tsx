import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { tournamentStatusLabel } from "@/lib/labels";
import { matchRow, matchCell, scoreCell, Pill } from "@/components/public/StatusPill";
import { computeGameTop } from "@/lib/duplicate/board";

export default async function TournamentGamesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: {
      games: {
        orderBy: { number: "asc" },
        include: {
          results: { include: { player: true } },
          referenceMoves: { select: { points: true } },
        },
      },
    },
  });
  if (!tournament || tournament.type !== "DUPLICATE") notFound();

  return (
    <div className="mx-auto max-w-4xl w-full px-4 py-10 flex flex-col gap-6">
      <div>
        <Link
          href={`/tournois/${tournament.slug}`}
          className="text-sm text-black/60 dark:text-white/60 hover:underline"
        >
          ← Retour au tournoi
        </Link>
        <p className="text-sm text-black/50 dark:text-white/50 mt-1">
          Scrabble duplicate · {tournamentStatusLabel[tournament.status]}
        </p>
        <h1 className="font-heading text-3xl font-semibold">
          Parties &amp; scores — {tournament.name}
        </h1>
      </div>

      <div className="flex flex-col gap-6">
        {tournament.games.map((game) => {
          const top = computeGameTop(game.referenceMoves, game.top);
          return (
            <div key={game.id} className="overflow-x-auto">
              <h3 className="font-medium mb-2">
                Partie {game.number}
                {top != null && (
                  <span className="text-xs text-black/50 dark:text-white/50 ml-2">
                    Top : {top}
                  </span>
                )}
              </h3>
              <table className="w-full text-sm border-collapse">
                <tbody>
                  {game.results.map((result) => {
                    const net = result.score - result.penalty;
                    return (
                      <tr key={result.id} className={matchRow}>
                        <td className={matchCell}>
                          {result.player.firstName} {result.player.lastName}
                        </td>
                        <td className={scoreCell}>{result.score}</td>
                        {result.penalty > 0 && (
                          <td className="py-2 pr-4">
                            <Pill tone="brick">-{result.penalty} pénalité</Pill>
                          </td>
                        )}
                        {top != null && (
                          <td className="py-2 pr-4 text-xs text-black/50 dark:text-white/50">
                            écart au top : {top - net}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
        {tournament.games.length === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            Aucun résultat publié pour le moment.
          </p>
        )}
      </div>
    </div>
  );
}
