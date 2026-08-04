import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeClassicTeamStandings } from "@/lib/classic/teamStandings";
import { computeClassicTeamPoolStandings } from "@/lib/classic/teamPoolStandings";
import { computeDuplicateTeamStandings } from "@/lib/duplicate/teamStandings";
import { pdfResponse, renderTablePdf, renderMultiTablePdf, type PdfSection } from "@/lib/pdf";
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
    const teamColumns = ["Rang", "Équipe", "J", "V", "N", "D", "Pts", "Éch. G", "Éch. N", "Éch. P", "Diff"];
    const teamWeights = [1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const standings = await computeClassicTeamStandings(tournament.id);
    const generalSection: PdfSection = {
      heading: tournament.format === "GROUPS" ? "Classement général" : undefined,
      headers: teamColumns,
      rows: standings.map((row, i) => [
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
      columnWeights: teamWeights,
    };

    if (tournament.format === "GROUPS") {
      // Poules : chaque poule joue son propre round-robin interne, donc son
      // classement n'a de sens que par poule — voir le commentaire
      // équivalent côté classement individuel. Le classement général
      // (toutes poules mélangées) reste inclus après, pour l'état des lieux
      // une fois la phase finale entamée.
      const pools = await computeClassicTeamPoolStandings(tournament.id);
      const poolSections: PdfSection[] = pools.map((pool) => ({
        heading: `Poule ${pool.poolName}`,
        headers: teamColumns,
        rows: pool.standings.map((row, i) => [
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
        columnWeights: teamWeights,
      }));
      pdf = await renderMultiTablePdf(
        `Classement par équipes — ${tournament.name}`,
        subtitle,
        [...poolSections, generalSection]
      );
    } else {
      pdf = await renderTablePdf(
        `Classement par équipes — ${tournament.name}`,
        subtitle,
        teamColumns,
        generalSection.rows,
        teamWeights
      );
    }
  } else {
    const standings = await computeDuplicateTeamStandings(tournament.id);
    pdf = await renderTablePdf(
      `Classement par équipes — ${tournament.name}`,
      subtitle,
      ["Rang", "Équipe", "Parties", "Score total", "Pénalités", "Net", "Négatif", "%"],
      standings.map((row, i) => [
        i + 1,
        row.name,
        row.gamesPlayed,
        row.totalScore,
        row.totalPenalty,
        row.net,
        row.negatif ?? "—",
        row.pourcentage != null ? `${row.pourcentage.toFixed(2)} %` : "—",
      ]),
      [1, 3, 1, 1, 1, 1, 1, 1]
    );
  }

  return pdfResponse(`classement-equipes-${slugify(tournament.name)}.pdf`, pdf);
}
