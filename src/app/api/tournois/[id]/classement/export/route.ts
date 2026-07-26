import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeClassicStandings } from "@/lib/classic/standings";
import { computeDuplicateStandingsWithGames } from "@/lib/duplicate/standings";
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
      [
        "Rang",
        "Joueur",
        "Âge",
        "Club",
        "Fédé",
        "Classement",
        "Joués",
        "V",
        "N",
        "D",
        "Points",
        "Buchholz",
        "Buchholz médian",
        "Sonneborn-Berger",
        "Cumul progressif",
        "Diff",
      ],
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
      ])
    );
  } else {
    const { rows: standings, games } = await computeDuplicateStandingsWithGames(tournament.id);
    csv = toCsv(
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
      ])
    );
  }

  return csvResponse(`classement-${slugify(tournament.name)}.csv`, csv);
}
