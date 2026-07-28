import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { csvResponse, toCsv } from "@/lib/csv";
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
            orderBy: { table: "asc" },
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
      match.isBye ? "" : match.homeScore ?? "",
      match.isBye ? "" : match.awayScore ?? "",
      match.isBye ? "" : match.awayPlayer ? `${match.awayPlayer.lastName} ${match.awayPlayer.firstName}` : "",
      match.isBye
        ? `Exempt (${match.homePlayer ? `${match.homePlayer.lastName} ${match.homePlayer.firstName}` : ""})`
        : statusLabel[match.status],
    ])
  );

  const csv = toCsv(
    ["Ronde", "Table", "Domicile", "Score dom.", "Score ext.", "Extérieur", "Statut"],
    rows
  );

  return csvResponse(`rondes-${slugify(tournament.name)}.csv`, csv);
}
