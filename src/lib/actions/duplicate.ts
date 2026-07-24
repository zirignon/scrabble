"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { isValidWord } from "@/lib/dictionary";

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

async function recomputeGameScore(gameId: string, playerId: string) {
  const moves = await prisma.duplicateMove.findMany({
    where: { gameId, playerId },
    select: { points: true },
  });
  const score = moves.reduce((sum, m) => sum + m.points, 0);

  const existing = await prisma.duplicateResult.findUnique({
    where: { gameId_playerId: { gameId, playerId } },
  });

  await prisma.duplicateResult.upsert({
    where: { gameId_playerId: { gameId, playerId } },
    update: { score },
    create: { gameId, playerId, score, penalty: existing?.penalty ?? 0 },
  });
}

const moveSchema = z.object({
  rack: z.string().optional(),
  word: z.string().optional(),
  points: z.string().optional(),
  top: z.string().optional(),
  isPass: z.string().optional(),
});

export async function addMoveAction(
  tournamentId: string,
  gameId: string,
  playerId: string,
  formData: FormData
) {
  await assertCanManage(tournamentId);
  const parsed = moveSchema.safeParse({
    rack: formData.get("rack") || undefined,
    word: formData.get("word") || undefined,
    points: formData.get("points") || undefined,
    top: formData.get("top") || undefined,
    isPass: formData.get("isPass") || undefined,
  });
  if (!parsed.success) return;

  const last = await prisma.duplicateMove.findFirst({
    where: { gameId, playerId },
    orderBy: { turnNumber: "desc" },
  });

  const isPass = parsed.data.isPass === "on";
  const word = parsed.data.word?.toUpperCase() || null;

  await prisma.duplicateMove.create({
    data: {
      gameId,
      playerId,
      turnNumber: (last?.turnNumber ?? 0) + 1,
      rack: parsed.data.rack?.toUpperCase() || null,
      word,
      points: parsed.data.points ? Number(parsed.data.points) : 0,
      top: parsed.data.top ? Number(parsed.data.top) : null,
      isPass,
      dictionaryValid: isPass || !word ? null : await isValidWord(word),
    },
  });

  await recomputeGameScore(gameId, playerId);

  revalidatePath(`/admin/tournois/${tournamentId}/parties/${gameId}`);
  revalidatePath(`/admin/tournois/${tournamentId}/parties`);
  revalidatePath(`/tournois`);
}

export async function updateMoveAction(
  tournamentId: string,
  gameId: string,
  moveId: string,
  formData: FormData
) {
  await assertCanManage(tournamentId);
  const parsed = moveSchema.safeParse({
    rack: formData.get("rack") || undefined,
    word: formData.get("word") || undefined,
    points: formData.get("points") || undefined,
    top: formData.get("top") || undefined,
    isPass: formData.get("isPass") || undefined,
  });
  if (!parsed.success) return;

  const isPass = parsed.data.isPass === "on";
  const word = parsed.data.word?.toUpperCase() || null;

  const move = await prisma.duplicateMove.update({
    where: { id: moveId },
    data: {
      rack: parsed.data.rack?.toUpperCase() || null,
      word,
      points: parsed.data.points ? Number(parsed.data.points) : 0,
      top: parsed.data.top ? Number(parsed.data.top) : null,
      isPass,
      dictionaryValid: isPass || !word ? null : await isValidWord(word),
    },
  });

  await recomputeGameScore(gameId, move.playerId);

  revalidatePath(`/admin/tournois/${tournamentId}/parties/${gameId}`);
  revalidatePath(`/admin/tournois/${tournamentId}/parties`);
  revalidatePath(`/tournois`);
}

export async function deleteMoveAction(
  tournamentId: string,
  gameId: string,
  moveId: string
) {
  await assertCanManage(tournamentId);
  const move = await prisma.duplicateMove.delete({ where: { id: moveId } });
  await recomputeGameScore(gameId, move.playerId);

  revalidatePath(`/admin/tournois/${tournamentId}/parties/${gameId}`);
  revalidatePath(`/admin/tournois/${tournamentId}/parties`);
  revalidatePath(`/tournois`);
}
