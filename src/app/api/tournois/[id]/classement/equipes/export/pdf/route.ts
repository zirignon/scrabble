import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeClassicTeamStandings } from "@/lib/classic/teamStandings";
import { computeDuplicateTeamStandings } from "@/lib/duplicate/teamStandings";
import { pdfResponse, renderTablePdf } from "@/lib/pdf";
import { slugify } from "@/lib/slug";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament || !tournament.isTeamEvent) {
    return new Response("Tournoi introuvable", { status: 404 });
  }

  const subtitle = `${tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"} par équipes — ${new Date(tournament.startDate).toLocaleDateString("fr-FR")}`;

  let pdf: Buffer;
  if (tournament.type === "CLASSIC") {
    const standings = await computeClassicTeamStandings(tournament.id);
    pdf = await renderTablePdf(
      `Classement par équipes — ${tournament.name}`,
      subtitle,
      ["Rang", "Équipe", "J", "V", "N", "D", "Pts", "Éch. G", "Éch. N", "Éch. P", "Diff"],
      standings.map((row, i) => [
        i + 1,
        row.name,
        row.played,
        row.wins,
        row.draws,
        row.losses,
        row.matchPoints,
        row.boardsWon,
        row.boardsDrawn,
        row.boardsLost,
        row.diff,
      ]),
      [1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    );
  } else {
    const standings = await computeDuplicateTeamStandings(tournament.id);
    pdf = await renderTablePdf(
      `Classement par équipes — ${tournament.name}`,
      subtitle,
      ["Rang", "Équipe", "Parties", "Score total", "Pénalités", "Net"],
      standings.map((row, i) => [
        i + 1,
        row.name,
        row.gamesPlayed,
        row.totalScore,
        row.totalPenalty,
        row.net,
      ]),
      [1, 3, 1, 1, 1, 1]
    );
  }

  return pdfResponse(`classement-equipes-${slugify(tournament.name)}.pdf`, pdf);
}
