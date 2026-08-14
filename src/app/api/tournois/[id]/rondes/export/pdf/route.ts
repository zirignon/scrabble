import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { pdfResponse, renderMultiTablePdf, type PdfSection } from "@/lib/pdf";
import { slugify } from "@/lib/slug";
import { countKnockoutEntrants, getKnockoutStageLabel } from "@/lib/classic/knockout";

const statusLabel: Record<string, string> = {
  SCHEDULED: "À jouer",
  PLAYED: "Joué",
  FORFEIT_HOME: "Forfait (domicile)",
  FORFEIT_AWAY: "Forfait (extérieur)",
  FORFEIT_BOTH: "Forfait (double)",
  CANCELLED: "Annulé",
};

const headers = ["Ronde", "Table", "Domicile", "Score dom.", "Score ext.", "Extérieur", "Statut"];
const columnWeights = [1.5, 0.6, 1.6, 0.9, 0.9, 1.6, 1.3];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(STAFF_ROLES);
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      rounds: {
        orderBy: { number: "asc" },
        include: {
          matches: {
            include: { homePlayer: true, awayPlayer: true },
            // id (ordre de création) plutôt que table — voir le commentaire
            // équivalent sur les pages rondes : le numéro de table repart de
            // 1 à chaque confrontation d'équipes, donc ce n'est pas une clé
            // de tri stable.
            orderBy: { id: "asc" },
          },
        },
      },
    },
  });
  if (!tournament || tournament.type !== "CLASSIC") {
    return new Response("Tournoi introuvable", { status: 404 });
  }
  if (!canManageTournament(session, tournament.organizerId)) {
    return new Response("Non autorisé", { status: 403 });
  }
  const rounds = tournament.rounds;

  function buildRows(round: (typeof rounds)[number], roundLabel: string) {
    return round.matches.map((match) => {
      // Par équipes, homeStarts alterne d'un échiquier à l'autre pour
      // équilibrer qui débute la partie ; le joueur qui débute est
      // toujours listé en "Domicile" — voir le commentaire équivalent sur
      // les pages rondes.
      const homeName = match.homePlayer ? `${match.homePlayer.lastName} ${match.homePlayer.firstName}` : "";
      const awayName = match.awayPlayer ? `${match.awayPlayer.lastName} ${match.awayPlayer.firstName}` : "";
      const leftName = match.homeStarts ? homeName : awayName;
      const rightName = match.homeStarts ? awayName : homeName;
      const leftScore = match.homeStarts ? match.homeScore : match.awayScore;
      const rightScore = match.homeStarts ? match.awayScore : match.homeScore;
      return [
        match.isThirdPlace ? "Match pour la 3ᵉ place" : roundLabel,
        match.table ?? "",
        match.isBye ? "" : leftName,
        match.isBye ? "" : (leftScore ?? ""),
        match.isBye ? "" : (rightScore ?? ""),
        match.isBye ? "" : rightName,
        match.isBye ? `Exempt (${homeName})` : statusLabel[match.status],
      ];
    });
  }

  // Une ronde à élimination directe (tableau après poules, phase finale de
  // round-robin/suisse, ou format élimination directe pur) affiche son nom
  // de tour (Demi-finales, Finale...) plutôt que son simple numéro — voir
  // le commentaire équivalent sur les pages rondes/écran public. Les rondes
  // de phase principale et celles de phase finale sont en plus regroupées
  // dans deux tableaux distincts (au lieu d'un seul tableau continu), pour
  // que la transition entre les deux phases soit visuellement nette.
  const mainRows: unknown[][] = [];
  const finalRows: unknown[][] = [];
  for (const round of rounds) {
    const grouped = round.matches.some((m) => m.poolId);
    const isKnockoutRound =
      tournament.format === "KNOCKOUT" ||
      (tournament.format === "GROUPS" && !grouped) ||
      round.isFinalPhase;
    const mainMatches = round.matches.filter((m) => !m.isThirdPlace);
    const roundLabel = isKnockoutRound
      ? getKnockoutStageLabel(countKnockoutEntrants(mainMatches))
      : `Ronde ${round.number}`;
    (isKnockoutRound ? finalRows : mainRows).push(...buildRows(round, roundLabel));
  }

  const sections: PdfSection[] = [];
  // Le titre de la première section n'est utile que s'il y a bien deux
  // phases distinctes à distinguer ; sinon (tournoi entièrement en
  // round-robin/suisse, ou entièrement en élimination directe), un seul
  // tableau sans sous-titre suffit, comme avant.
  const hasTwoPhases = mainRows.length > 0 && finalRows.length > 0;
  if (mainRows.length > 0) {
    sections.push({
      heading: hasTwoPhases
        ? tournament.format === "GROUPS"
          ? "Phase de poules"
          : "Phase principale"
        : undefined,
      headers,
      rows: mainRows,
      columnWeights,
    });
  }
  if (finalRows.length > 0) {
    sections.push({
      heading: hasTwoPhases ? "Phase finale" : undefined,
      headers,
      rows: finalRows,
      columnWeights,
    });
  }

  const subtitle = `${tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"} — ${new Date(tournament.startDate).toLocaleDateString("fr-FR")}`;

  const pdf = await renderMultiTablePdf(`Rondes — ${tournament.name}`, subtitle, sections, {
    landscape: true,
  });

  return pdfResponse(`rondes-${slugify(tournament.name)}.pdf`, pdf);
}
