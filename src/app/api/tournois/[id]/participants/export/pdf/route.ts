import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { pdfResponse, renderTablePdf } from "@/lib/pdf";
import { slugify } from "@/lib/slug";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    return new Response("Tournoi introuvable", { status: 404 });
  }

  const registrations = await prisma.registration.findMany({
    where: { tournamentId: id },
    include: { player: { include: { club: true } } },
    orderBy: { player: { lastName: "asc" } },
  });

  const subtitle = `${tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"} — ${new Date(tournament.startDate).toLocaleDateString("fr-FR")}`;

  const pdf = await renderTablePdf(
    `Participants — ${tournament.name}`,
    subtitle,
    ["Numéro", "Licence", "Nom et prénoms", "Club", "Fédé"],
    registrations.map((r, i) => [
      i + 1,
      r.player.licenseNumber ?? "—",
      `${r.player.lastName} ${r.player.firstName}`,
      r.player.club?.name ?? "—",
      r.player.club?.federation ?? "—",
    ]),
    [1, 2, 3, 3, 2]
  );

  return pdfResponse(`participants-${slugify(tournament.name)}.pdf`, pdf);
}
