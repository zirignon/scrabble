import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { pdfResponse, renderTablePdf } from "@/lib/pdf";
import { slugify } from "@/lib/slug";

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

  const rows = tournament.rounds.flatMap((round) =>
    round.matches.map((match) => [
      round.number,
      match.table ?? "",
      match.isBye ? "" : match.homePlayer ? `${match.homePlayer.lastName} ${match.homePlayer.firstName}` : "",
      match.isBye ? "" : (match.homeScore ?? ""),
      match.isBye ? "" : (match.awayScore ?? ""),
      match.isBye ? "" : match.awayPlayer ? `${match.awayPlayer.lastName} ${match.awayPlayer.firstName}` : "",
      match.isBye
        ? `Exempt (${match.homePlayer ? `${match.homePlayer.lastName} ${match.homePlayer.firstName}` : ""})`
        : statusLabel[match.status],
    ])
  );

  const subtitle = `${tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"} — ${new Date(tournament.startDate).toLocaleDateString("fr-FR")}`;

  const pdf = await renderTablePdf(
    `Rondes — ${tournament.name}`,
    subtitle,
    ["Ronde", "Table", "Domicile", "Score dom.", "Score ext.", "Extérieur", "Statut"],
    rows,
    [0.7, 0.7, 1.8, 1, 1, 1.8, 1.4],
    { landscape: true }
  );

  return pdfResponse(`rondes-${slugify(tournament.name)}.pdf`, pdf);
}
