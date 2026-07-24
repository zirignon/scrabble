import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, STAFF_ROLES } from "@/lib/guards";
import { computeGameClassementSheet } from "@/lib/duplicate/gameSheet";
import { csvResponse, toCsv } from "@/lib/csv";
import { slugify } from "@/lib/slug";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; gameId: string }> }
) {
  await requireRole(STAFF_ROLES);
  const { id, gameId } = await params;

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!tournament || tournament.type !== "DUPLICATE" || !game || game.tournamentId !== tournament.id) {
    return new Response("Partie introuvable", { status: 404 });
  }

  const rows = await computeGameClassementSheet(gameId);
  const csv = toCsv(
    [
      "Rang",
      "Nom",
      "Prénom",
      "N° licence",
      "Catégorie",
      "Club",
      "Fédération",
      "Parties",
      "Score",
      "Pénalité",
      "Top",
      "Négatif",
      "%",
      "Cumul",
    ],
    rows.map((row, i) => [
      i + 1,
      row.lastName,
      row.firstName,
      row.licenseNumber ?? "",
      row.category ?? "",
      row.clubName ?? "",
      row.federation ?? "",
      row.gamesPlayed,
      row.net,
      row.penalty,
      row.top ?? "",
      row.negatif ?? "",
      row.pourcentage != null ? row.pourcentage.toFixed(2) : "",
      row.cumul,
    ])
  );

  return csvResponse(
    `classement-partie-${game.number}-${slugify(tournament.name)}.csv`,
    csv
  );
}
