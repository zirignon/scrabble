import { prisma } from "@/lib/prisma";
import { requireRole, STAFF_ROLES } from "@/lib/guards";
import { csvResponse, toCsv } from "@/lib/csv";

export async function GET() {
  await requireRole(STAFF_ROLES);

  const players = await prisma.player.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { club: true },
  });

  const csv = toCsv(
    [
      "Prénom",
      "Nom",
      "Club",
      "N° licence",
      "Catégorie",
      "Série duplicate",
      "Elo duplicate",
      "Série classique",
      "Elo classique",
      "Coeff. classique",
      "Nationalité",
      "Fédération",
    ],
    players.map((p) => [
      p.firstName,
      p.lastName,
      p.club?.name ?? "",
      p.licenseNumber ?? "",
      p.category ?? "",
      p.classification ?? "",
      p.eloDuplicate ?? "",
      p.classificationClassic ?? "",
      p.eloClassic ?? "",
      p.coefficientClassic ?? "",
      p.nationality ?? "",
      p.federation ?? "",
    ])
  );

  return csvResponse("joueurs.csv", csv);
}
