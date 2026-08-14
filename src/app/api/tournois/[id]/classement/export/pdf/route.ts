import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeClassicStandings } from "@/lib/classic/standings";
import { computeClassicPoolStandings } from "@/lib/classic/poolStandings";
import { computeDuplicateStandingsWithGames } from "@/lib/duplicate/standings";
import { pdfResponse, renderTablePdf, renderMultiTablePdf, type PdfSection } from "@/lib/pdf";
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
  if (tournament.type === "CLASSIC" && tournament.format === "GROUPS" && !tournament.isTeamEvent) {
    // Poules : chaque poule joue son propre round-robin interne, donc son
    // classement n'a de sens que par poule (contrairement au classement
    // général qui mélangerait des joueurs ne s'étant jamais affrontés) —
    // voir la page classement publique, qui affiche déjà un tableau par
    // poule plutôt qu'un classement général unique dans ce cas.
    const pools = await computeClassicPoolStandings(tournament.id);
    const sections: PdfSection[] = pools.map((pool) => ({
      heading: `Poule ${pool.poolName}`,
      headers: ["Rang", "Joueur", "J", "V", "N", "D", "Pts", "Diff", "SB", "Bchz", "Bchz méd.", "Cumul"],
      rows: pool.standings.map((row, i) => [
        i + 1,
        `${row.lastName} ${row.firstName}`,
        row.played,
        row.wins,
        row.draws,
        row.losses,
        row.matchPoints,
        row.diff,
        row.sonnebornBerger,
        row.buchholz,
        row.buchholzMedian,
        row.cumulativeScore,
      ]),
      columnWeights: [1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    }));
    pdf = await renderMultiTablePdf(
      `Classement par poule — ${tournament.name}`,
      subtitle,
      sections,
      { landscape: true }
    );
  } else if (tournament.type === "CLASSIC") {
    const standings = await computeClassicStandings(tournament.id);
    pdf = await renderTablePdf(
      `Classement — ${tournament.name}`,
      subtitle,
      ["Rang", "Joueur", "Âge", "Club", "Fédé", "Classement", "J", "V", "N", "D", "Pts", "Diff", "SB", "Bchz", "Bchz méd.", "Cumul"],
      standings.map((row, i) => [
        i + 1,
        `${row.lastName} ${row.firstName}`,
        row.category ?? "",
        row.clubName ?? "",
        row.federation ?? "",
        row.classification ?? "",
        row.played,
        row.wins,
        row.draws,
        row.losses,
        row.matchPoints,
        row.diff,
        row.sonnebornBerger,
        row.buchholz,
        row.buchholzMedian,
        row.cumulativeScore,
      ]),
      [1, 2.6, 1, 1.4, 1, 1.2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      { landscape: true }
    );
  } else {
    const { rows: standings, games, topCumul } = await computeDuplicateStandingsWithGames(tournament.id);
    pdf = await renderTablePdf(
      `Classement — ${tournament.name}`,
      subtitle,
      [
        "Rang",
        "Licence",
        "Nom",
        "Prénoms",
        "Cat.",
        "Série",
        "Club",
        "Nat",
        "Cumul",
        "Négatif",
        "%",
        ...games.map((g) => `P${g.gameNumber}`),
      ],
      standings.map((row, i) => {
        const negatif = topCumul != null ? row.net - topCumul : "—";
        const pourcentage = topCumul != null && topCumul > 0 ? `${((row.net / topCumul) * 100).toFixed(2)} %` : "—";
        return [
          i + 1,
          row.licenseNumber ?? "—",
          row.lastName,
          row.firstName,
          row.classification ?? "—",
          row.category ?? "—",
          row.clubName ?? "—",
          row.nationality ?? "—",
          row.net,
          negatif,
          pourcentage,
          ...games.map((g) => row.perGame[g.gameNumber] ?? "—"),
        ];
      }),
      [1, 1.2, 1.4, 1.4, 0.8, 0.8, 1.2, 0.8, 1, 1, 1, ...games.map(() => 0.9)],
      { landscape: true }
    );
  }

  return pdfResponse(`classement-${slugify(tournament.name)}.pdf`, pdf);
}
