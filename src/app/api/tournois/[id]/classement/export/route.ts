import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeClassicStandings } from "@/lib/classic/standings";
import { computeDuplicateStandings } from "@/lib/duplicate/standings";
import { csvResponse, toCsv } from "@/lib/csv";
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

  let csv: string;
  if (tournament.type === "CLASSIC") {
    const standings = await computeClassicStandings(tournament.id);
    csv = toCsv(
      ["Rang", "Joueur", "Joués", "V", "N", "D", "Points", "Buchholz", "Sonneborn-Berger", "Diff"],
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
      ])
    );
  } else {
    const standings = await computeDuplicateStandings(tournament.id);
    csv = toCsv(
      ["Rang", "Joueur", "Parties", "Score total", "Pénalités", "Net"],
      standings.map((row, i) => [
        i + 1,
        `${row.firstName} ${row.lastName}`,
        row.gamesPlayed,
        row.totalScore,
        row.totalPenalty,
        row.net,
      ])
    );
  }

  return csvResponse(`classement-${slugify(tournament.name)}.csv`, csv);
}
