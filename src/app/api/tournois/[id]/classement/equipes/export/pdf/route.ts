import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeClassicTeamStandings,
  computeClassicTeamSwissPhaseStandings,
  type ClassicTeamStandingRow,
} from "@/lib/classic/teamStandings";
import {
  computeClassicTeamGeneralPoolStandings,
  computeClassicTeamPoolStandings,
} from "@/lib/classic/teamPoolStandings";
import { computeDuplicateTeamStandings } from "@/lib/duplicate/teamStandings";
import { pdfResponse, renderTablePdf, renderMultiTablePdf, type PdfSection } from "@/lib/pdf";
import { slugify } from "@/lib/slug";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament || !tournament.isTeamEvent) {
    return new Response("Tournoi introuvable", { status: 404 });
  }

  // Instantané "classement après la ronde N" — voir le commentaire équivalent
  // dans classement/export/pdf/route.ts (version individuelle).
  const rondeParam = request.nextUrl.searchParams.get("ronde");
  const uptoRoundNumber =
    rondeParam && /^\d+$/.test(rondeParam) ? Number(rondeParam) : undefined;

  const subtitle = `${tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"} par équipes — ${new Date(tournament.startDate).toLocaleDateString("fr-FR")}${
    uptoRoundNumber !== undefined ? ` — Instantané après la ronde ${uptoRoundNumber}` : ""
  }`;

  let pdf: Buffer;
  if (tournament.type === "CLASSIC") {
    const teamColumns = ["Rang", "Équipe", "J", "V", "N", "D", "Pts", "Éch. G", "Éch. N", "Éch. P", "Diff"];
    const teamWeights = [1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const isPoolFormat = tournament.format === "GROUPS" || tournament.format === "COMBINED";
    const standings = await computeClassicTeamStandings(tournament.id, uptoRoundNumber);
    const generalSection: PdfSection = {
      heading: isPoolFormat ? "Classement général" : undefined,
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

    if (isPoolFormat) {
      // Poules : chaque poule joue son propre round-robin interne, donc son
      // classement n'a de sens que par poule — voir le commentaire
      // équivalent côté classement individuel.
      const teamRowMapper = (row: ClassicTeamStandingRow, i: number) => [
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
      ];
      const pools = await computeClassicTeamPoolStandings(tournament.id, uptoRoundNumber);
      const poolSections: PdfSection[] = pools.map((pool) => ({
        heading: `Poule ${pool.poolName}`,
        headers: teamColumns,
        rows: pool.standings.map(teamRowMapper),
        columnWeights: teamWeights,
      }));

      if (tournament.format === "COMBINED") {
        // Voir le commentaire équivalent côté classement individuel : une
        // fois la 1re ronde suisse générée, les classements par poule
        // n'ont plus lieu d'être affichés à côté du classement combiné, qui
        // les remplace entièrement.
        const lastRound =
          uptoRoundNumber !== undefined
            ? { number: uptoRoundNumber }
            : await prisma.round.findFirst({
                where: { tournamentId: tournament.id },
                orderBy: { number: "desc" },
              });
        // À un instant donné (uptoRoundNumber), distinct de l'état actuel du
        // tournoi — voir le commentaire équivalent côté individuel.
        const swissPhaseStarted =
          (await prisma.round.count({
            where: {
              tournamentId: tournament.id,
              isSwissPhase: true,
              ...(uptoRoundNumber !== undefined ? { number: { lte: uptoRoundNumber } } : {}),
            },
          })) > 0;

        if (swissPhaseStarted) {
          const swissPhaseStandings = await computeClassicTeamSwissPhaseStandings(tournament.id, uptoRoundNumber);
          pdf = await renderMultiTablePdf(
            `Classement par équipes — ${tournament.name}`,
            subtitle,
            [
              {
                heading: `Classement après la ronde ${lastRound?.number}`,
                headers: teamColumns,
                rows: swissPhaseStandings.map(teamRowMapper),
                columnWeights: teamWeights,
              },
            ]
          );
        } else {
          // Après la phase de poules, un classement général (fusion de
          // toutes les poules) s'ajoute à la suite — c'est ce même
          // classement qui amorce la phase suisse.
          const generalStandings = await computeClassicTeamGeneralPoolStandings(tournament.id, uptoRoundNumber);
          const generalPoolSection: PdfSection[] =
            generalStandings.length > 0
              ? [
                  {
                    heading: "Classement général",
                    headers: teamColumns,
                    rows: generalStandings.map(teamRowMapper),
                    columnWeights: teamWeights,
                  },
                ]
              : [];
          pdf = await renderMultiTablePdf(
            `Classement par équipes — ${tournament.name}`,
            subtitle,
            [...poolSections, ...generalPoolSection]
          );
        }
      } else {
        pdf = await renderMultiTablePdf(
          `Classement par équipes — ${tournament.name}`,
          subtitle,
          [...poolSections, generalSection]
        );
      }
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

  const filenameSuffix = uptoRoundNumber !== undefined ? `-ronde-${uptoRoundNumber}` : "";
  return pdfResponse(`classement-equipes${filenameSuffix}-${slugify(tournament.name)}.pdf`, pdf);
}
