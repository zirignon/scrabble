import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeClassicStandings } from "@/lib/classic/standings";
import { computeDuplicateStandings } from "@/lib/duplicate/standings";
import { pdfResponse, renderTablePdf } from "@/lib/pdf";
import { slugify } from "@/lib/slug";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    return new Response("Tournoi introuvable", { status: 404 });
  }

  const subtitle = `${tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"} — ${new Date(tournament.startDate).toLocaleDateString("fr-FR")}`;

  let pdf: Buffer;
  if (tournament.type === "CLASSIC") {
    const standings = await computeClassicStandings(tournament.id);
    pdf = await renderTablePdf(
      `Classement — ${tournament.name}`,
      subtitle,
      ["Rang", "Joueur", "J", "V", "N", "D", "Pts", "Bchz", "SB", "Diff"],
      standings.map((row, i) => [
        i + 1,
        `${row.firstName} ${row.lastName}`,
        row.played,
        row.wins,
        row.draws,
        row.losses,
        row.matchPoints,
        row.buchholz,
        row.sonnebornBerger,
        row.diff,
      ]),
      [1, 3, 1, 1, 1, 1, 1, 1, 1, 1]
    );
  } else {
    const standings = await computeDuplicateStandings(tournament.id);
    pdf = await renderTablePdf(
      `Classement — ${tournament.name}`,
      subtitle,
      ["Rang", "Joueur", "Parties", "Score total", "Pénalités", "Net"],
      standings.map((row, i) => [
        i + 1,
        `${row.firstName} ${row.lastName}`,
        row.gamesPlayed,
        row.totalScore,
        row.totalPenalty,
        row.net,
      ]),
      [1, 3, 1, 1, 1, 1]
    );
  }

  return pdfResponse(`classement-${slugify(tournament.name)}.pdf`, pdf);
}
