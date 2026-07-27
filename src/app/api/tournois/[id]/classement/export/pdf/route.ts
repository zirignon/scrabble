import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeClassicStandings } from "@/lib/classic/standings";
import { computeDuplicateStandingsWithGames } from "@/lib/duplicate/standings";
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
      ["Rang", "Joueur", "Âge", "Club", "Fédé", "Classement", "J", "V", "N", "D", "Pts", "Bchz", "Bchz méd.", "SB", "Cumul", "Diff"],
      standings.map((row, i) => [
        i + 1,
        `${row.firstName} ${row.lastName}`,
        row.category ?? "",
        row.clubName ?? "",
        row.federation ?? "",
        row.classification ?? "",
        row.played,
        row.wins,
        row.draws,
        row.losses,
        row.matchPoints,
        row.buchholz,
        row.buchholzMedian,
        row.sonnebornBerger,
        row.cumulativeScore,
        row.diff,
      ]),
      [1, 2.6, 1, 1.4, 1, 1.2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      { landscape: true }
    );
  } else {
    const { rows: standings, games } = await computeDuplicateStandingsWithGames(tournament.id);
    pdf = await renderTablePdf(
      `Classement — ${tournament.name}`,
      subtitle,
      [
        "Rang",
        "Licence",
        "Joueur",
        "Classement",
        "Âge",
        "Club",
        "Nat",
        "Cumul",
        ...games.map((g) => `P${g.gameNumber}`),
      ],
      standings.map((row, i) => [
        i + 1,
        row.licenseNumber ?? "",
        `${row.firstName} ${row.lastName}`,
        row.classification ?? "",
        row.category ?? "",
        row.clubName ?? "",
        row.nationality ?? "",
        row.net,
        ...games.map((g) => row.perGame[g.gameNumber] ?? ""),
      ]),
      [1, 1.2, 2.4, 1, 0.8, 1.2, 0.8, 1, ...games.map(() => 0.9)],
      { landscape: true }
    );
  }

  return pdfResponse(`classement-${slugify(tournament.name)}.pdf`, pdf);
}
