import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { csvResponse, toCsv } from "@/lib/csv";
import { slugify } from "@/lib/slug";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole(STAFF_ROLES);
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      games: {
        orderBy: { number: "asc" },
        include: { results: { include: { player: true } } },
      },
    },
  });
  if (!tournament || tournament.type !== "DUPLICATE") {
    return new Response("Tournoi introuvable", { status: 404 });
  }
  if (!canManageTournament(session, tournament.organizerId)) {
    return new Response("Non autorisé", { status: 403 });
  }

  const rows = tournament.games.flatMap((game) =>
    game.results.map((result) => [
      game.number,
      game.top ?? "",
      `${result.player.firstName} ${result.player.lastName}`,
      result.score,
      result.penalty,
      result.score - result.penalty,
      game.top != null ? game.top - (result.score - result.penalty) : "",
    ])
  );

  const csv = toCsv(
    ["Partie", "Top", "Joueur", "Score", "Pénalité", "Net", "Écart au top"],
    rows
  );

  return csvResponse(`parties-${slugify(tournament.name)}.csv`, csv);
}
