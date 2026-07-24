"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";

async function assertCanManage(tournamentId: string) {
  const session = await requireRole(STAFF_ROLES);
  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
  });
  if (!canManageTournament(session, tournament.organizerId)) {
    throw new Error("Non autorisé.");
  }
  return tournament;
}

export async function addGameAction(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "DUPLICATE") throw new Error("Tournoi non duplicate.");

  const last = await prisma.game.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
  });
  await prisma.game.create({
    data: { tournamentId, number: (last?.number ?? 0) + 1 },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/parties`);
}

export async function saveGameScoresAction(
  tournamentId: string,
  gameId: string,
  formData: FormData
) {
  await assertCanManage(tournamentId);

  const topRaw = formData.get("top");
  const top = topRaw ? Number(topRaw) : null;
  await prisma.game.update({
    where: { id: gameId },
    data: { top: top !== null && !Number.isNaN(top) ? top : null },
  });

  const registrations = await prisma.registration.findMany({
    where: { tournamentId },
    select: { playerId: true },
  });

  for (const reg of registrations) {
    const scoreRaw = formData.get(`score_${reg.playerId}`);
    const penaltyRaw = formData.get(`penalty_${reg.playerId}`);
    if (scoreRaw === null || scoreRaw === "") continue;

    const score = Number(scoreRaw);
    const penalty = penaltyRaw ? Number(penaltyRaw) : 0;
    if (Number.isNaN(score) || Number.isNaN(penalty)) continue;

    await prisma.duplicateResult.upsert({
      where: { gameId_playerId: { gameId, playerId: reg.playerId } },
      update: { score, penalty },
      create: { gameId, playerId: reg.playerId, score, penalty },
    });
  }

  revalidatePath(`/admin/tournois/${tournamentId}/parties`);
  revalidatePath(`/tournois`);
}
