import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeClassicTeamStandings } from "@/lib/classic/teamStandings";
import { computeDuplicateTeamStandings } from "@/lib/duplicate/teamStandings";
import { csvResponse, toCsv } from "@/lib/csv";
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

  let csv: string;
  if (tournament.type === "CLASSIC") {
    const standings = await computeClassicTeamStandings(tournament.id);
    csv = toCsv(
      ["Rang", "Équipe", "Joués", "V", "N", "D", "Points", "Éch. gagnés", "Éch. nuls", "Éch. perdus", "Diff"],
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
      ])
    );
  } else {
    const standings = await computeDuplicateTeamStandings(tournament.id);
    csv = toCsv(
      ["Rang", "Équipe", "Parties", "Score total", "Pénalités", "Net", "Négatif", "%"],
      standings.map((row, i) => [
        i + 1,
        row.name,
        row.gamesPlayed,
        row.totalScore,
        row.totalPenalty,
        row.net,
        row.negatif ?? "",
        row.pourcentage != null ? row.pourcentage.toFixed(2) : "",
      ])
    );
  }

  return csvResponse(`classement-equipes-${slugify(tournament.name)}.csv`, csv);
}
