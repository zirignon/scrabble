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

  if (q.length < 2) {
    return NextResponse.json({ players: [] });
  }

  const excludePlayerIds = tournamentId
    ? (
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
      clubName: p.club?.name ?? null,
    })),
  });
}
