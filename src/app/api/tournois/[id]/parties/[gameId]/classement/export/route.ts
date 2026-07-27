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

  const { rows, cumulTop } = await computeGameClassementSheet(gameId);
  const csv = toCsv(
    [
      "Rang",
      "Nom",
      "Prénom",
      "N° licence",
      "Catégorie",
      "Classification",
      "Club",
      "Fédération",
      "Nat",
      "Parties",
      "Score",
      "Pénalité",
      "Net",
      "Top",
      "Négatif",
      "%",
      "Cumul des tops",
    ],
    rows.map((row, i) => [
      i + 1,
      row.lastName,
      row.firstName,
      row.licenseNumber ?? "",
      row.category ?? "",
      row.classification ?? "",
      row.clubName ?? "",
      row.federation ?? "",
      row.nationality ?? "",
      row.gamesPlayed,
      row.score,
      row.penalty,
      row.net,
      row.top ?? "",
      row.negatif ?? "",
      row.pourcentage != null ? row.pourcentage.toFixed(2) : "",
      cumulTop ?? "",
    ])
  );

  return csvResponse(
    `classement-partie-${game.number}-${slugify(tournament.name)}.csv`,
    csv
  );
}
