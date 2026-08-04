import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { pdfResponse, renderTablePdf } from "@/lib/pdf";
import { slugify } from "@/lib/slug";
import { countKnockoutEntrants, getKnockoutStageLabel } from "@/lib/classic/knockout";

const statusLabel: Record<string, string> = {
  SCHEDULED: "À jouer",
  PLAYED: "Joué",
  FORFEIT_HOME: "Forfait (domicile)",
  FORFEIT_AWAY: "Forfait (extérieur)",
  CANCELLED: "Annulé",
};

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

  const rows = tournament.rounds.flatMap((round) => {
    // Une ronde à élimination directe (tableau après poules, phase finale
    // de round-robin/suisse, ou format élimination directe pur) affiche son
    // nom de tour (Quarts/Demi-finales/Finale, selon le nombre d'entrants)
    // plutôt que son simple numéro de ronde — voir le commentaire
    // équivalent sur les pages rondes/écran public.
    const grouped = round.matches.some((m) => m.poolId);
    const isKnockoutRound =
      tournament.format === "KNOCKOUT" ||
      (tournament.format === "GROUPS" && !grouped) ||
      round.isFinalPhase;
    const mainMatches = round.matches.filter((m) => !m.isThirdPlace);
    const roundLabel = isKnockoutRound
      ? getKnockoutStageLabel(countKnockoutEntrants(mainMatches))
      : `Ronde ${round.number}`;

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
  });

  const subtitle = `${tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"} — ${new Date(tournament.startDate).toLocaleDateString("fr-FR")}`;

  const pdf = await renderTablePdf(
    `Rondes — ${tournament.name}`,
    subtitle,
    ["Ronde", "Table", "Domicile", "Score dom.", "Score ext.", "Extérieur", "Statut"],
    rows,
    [1.5, 0.6, 1.6, 0.9, 0.9, 1.6, 1.3],
    { landscape: true }
  );

  return pdfResponse(`rondes-${slugify(tournament.name)}.pdf`, pdf);
}
