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
    ["Prénom", "Nom", "Club", "N° licence", "Catégorie"],
    players.map((p) => [p.firstName, p.lastName, p.club?.name ?? "", p.licenseNumber ?? "", p.category ?? ""])
  );

  return csvResponse("joueurs.csv", csv);
}
