import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, STAFF_ROLES } from "@/lib/guards";
import { computeGameClassementSheet } from "@/lib/duplicate/gameSheet";
import { pdfResponse, renderTablePdf } from "@/lib/pdf";
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
  const top = rows[0]?.top ?? null;
  const subtitleParts = [`Partie ${game.number}`];
  if (top != null) subtitleParts.push(`Top : ${top}`);
  if (cumulTop != null) subtitleParts.push(`Cumul des tops : ${cumulTop}`);
  const subtitle = subtitleParts.join(" — ");

  const pdf = await renderTablePdf(
    `Fiche de classement — ${tournament.name}`,
    subtitle,
    [
      "Rang",
      "Nom",
      "Prénom",
      "Licence",
      "Cat.",
      "Classement",
      "Club",
      "Fédér.",
      "Nat",
      "Score",
      "Pén.",
      "Net",
      "Top",
      "Négatif",
      "%",
    ],
    rows.map((row, i) => [
      i + 1,
      row.lastName,
      row.firstName,
      row.licenseNumber ?? "—",
      row.category ?? "—",
      row.classification ?? "—",
      row.clubName ?? "—",
      row.federation ?? "—",
      row.nationality ?? "—",
      row.score,
      row.penalty > 0 ? `-${row.penalty}` : "—",
      row.net,
      row.top ?? "—",
      row.negatif ?? "—",
      row.pourcentage != null ? `${row.pourcentage.toFixed(2)} %` : "—",
    ]),
    [1, 1.8, 1.8, 1.2, 0.9, 1, 1.8, 1.2, 0.7, 0.9, 0.8, 0.9, 0.9, 1, 1.2],
    { landscape: true }
  );

  return pdfResponse(
    `classement-partie-${game.number}-${slugify(tournament.name)}.pdf`,
    pdf
  );
}
