import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, STAFF_ROLES } from "@/lib/guards";

const RESULT_LIMIT = 20;

// Recherche de joueurs par nom ou n° de licence, utilisée par le sélecteur
// d'inscription (voir PlayerSearchSelect) — la base de joueurs pouvant
// compter des dizaines de milliers d'entrées après un import fédéral, un
// simple <select> listant tout le monde n'est plus utilisable.
export async function GET(request: NextRequest) {
  await requireRole(STAFF_ROLES);

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const tournamentId = searchParams.get("tournamentId") ?? undefined;
  // "team" : cas de l'ajout direct d'un joueur à une équipe — on n'exclut
  // que les joueurs déjà affectés à une équipe de ce tournoi (l'inscription
  // se fait automatiquement à l'ajout), pas tous les inscrits.
  const context = searchParams.get("context");

  if (q.length < 2) {
    return NextResponse.json({ players: [] });
  }

  const excludePlayerIds = tournamentId
    ? context === "team"
      ? (
          await prisma.teamMember.findMany({
            where: { team: { tournamentId } },
            select: { playerId: true },
          })
        ).map((m) => m.playerId)
      : (
          await prisma.registration.findMany({
            where: { tournamentId },
            select: { playerId: true },
          })
        ).map((r) => r.playerId)
    : [];

  const where: Prisma.PlayerWhereInput = {
    id: excludePlayerIds.length > 0 ? { notIn: excludePlayerIds } : undefined,
    OR: [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { licenseNumber: { contains: q, mode: "insensitive" } },
    ],
  };

  const players = await prisma.player.findMany({
    where,
    include: { club: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: RESULT_LIMIT,
  });

  return NextResponse.json({
    players: players.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      licenseNumber: p.licenseNumber,
      clubId: p.clubId,
      clubName: p.club?.name ?? null,
      category: p.category,
      classification: p.classification,
      classificationClassic: p.classificationClassic,
      coefficientClassic: p.coefficientClassic,
      eloDuplicate: p.eloDuplicate,
      eloClassic: p.eloClassic,
      nationality: p.nationality,
      federation: p.federation,
    })),
  });
}
