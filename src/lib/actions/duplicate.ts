"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { notifyTournamentUpdate } from "@/lib/displayEvents";

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

export async function setGameTimerDurationAction(
  tournamentId: string,
  gameId: string,
  formData: FormData
) {
  await assertCanManage(tournamentId);
  const minutes = Number(formData.get("minutes"));
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  const seconds = Math.round(minutes * 60);

  await prisma.game.update({
    where: { id: gameId },
    data: {
      timerDurationSeconds: seconds,
      timerRemainingSeconds: seconds,
      timerRunning: false,
      timerStartedAt: null,
    },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/parties`);
  notifyTournamentUpdate(tournamentId);
  revalidatePath(`/tournois`);
}

export async function startGameTimerAction(tournamentId: string, gameId: string) {
  await assertCanManage(tournamentId);
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  if (!game.timerRunning) {
    await prisma.game.update({
      where: { id: gameId },
      data: {
        timerRunning: true,
        timerStartedAt: new Date(),
        timerRemainingSeconds: game.timerRemainingSeconds ?? game.timerDurationSeconds,
      },
    });
  }

  revalidatePath(`/admin/tournois/${tournamentId}/parties`);
  notifyTournamentUpdate(tournamentId);
  revalidatePath(`/tournois`);
}

export async function pauseGameTimerAction(tournamentId: string, gameId: string) {
  await assertCanManage(tournamentId);
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  if (game.timerRunning && game.timerStartedAt) {
    const elapsed = Math.floor((Date.now() - game.timerStartedAt.getTime()) / 1000);
    const remaining = Math.max(
      0,
      (game.timerRemainingSeconds ?? game.timerDurationSeconds) - elapsed
    );
    await prisma.game.update({
      where: { id: gameId },
      data: { timerRunning: false, timerStartedAt: null, timerRemainingSeconds: remaining },
    });
  }

  revalidatePath(`/admin/tournois/${tournamentId}/parties`);
  notifyTournamentUpdate(tournamentId);
  revalidatePath(`/tournois`);
}

export async function resetGameTimerAction(tournamentId: string, gameId: string) {
  await assertCanManage(tournamentId);
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  await prisma.game.update({
    where: { id: gameId },
    data: {
      timerRunning: false,
      timerStartedAt: null,
      timerRemainingSeconds: game.timerDurationSeconds,
    },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/parties`);
  notifyTournamentUpdate(tournamentId);
  revalidatePath(`/tournois`);
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
  notifyTournamentUpdate(tournamentId);
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
  notifyTournamentUpdate(tournamentId);
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
    },
  });

  await recomputeGameScore(gameId, playerId);

  revalidatePath(`/admin/tournois/${tournamentId}/parties/${gameId}`);
  revalidatePath(`/admin/tournois/${tournamentId}/parties`);
  notifyTournamentUpdate(tournamentId);
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
    },
  });

  await recomputeGameScore(gameId, move.playerId);

  revalidatePath(`/admin/tournois/${tournamentId}/parties/${gameId}`);
  revalidatePath(`/admin/tournois/${tournamentId}/parties`);
  notifyTournamentUpdate(tournamentId);
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
  notifyTournamentUpdate(tournamentId);
  revalidatePath(`/tournois`);
}

const referenceMoveSchema = z.object({
  row: z.string().min(1),
  col: z.string().min(1),
  direction: z.enum(["ACROSS", "DOWN"]),
  word: z.string().optional(),
  points: z.string().optional(),
  isPass: z.string().optional(),
});

function parseReferenceMove(formData: FormData) {
  const parsed = referenceMoveSchema.safeParse({
    row: formData.get("row"),
    col: formData.get("col"),
    direction: formData.get("direction"),
    word: formData.get("word") || undefined,
    points: formData.get("points") || undefined,
    isPass: formData.get("isPass") || undefined,
  });
  if (!parsed.success) return null;

  const row = Number(parsed.data.row);
  const col = Number(parsed.data.col);
  if (!Number.isInteger(row) || row < 1 || row > 15) return null;
  if (!Number.isInteger(col) || col < 1 || col > 15) return null;

  return {
    row,
    col,
    direction: parsed.data.direction,
    word: parsed.data.word?.toUpperCase() || null,
    points: parsed.data.points ? Number(parsed.data.points) : 0,
    isPass: parsed.data.isPass === "on",
  };
}

export async function addReferenceMoveAction(
  tournamentId: string,
  gameId: string,
  formData: FormData
) {
  await assertCanManage(tournamentId);
  const data = parseReferenceMove(formData);
  if (!data) return;

  const last = await prisma.referenceMove.findFirst({
    where: { gameId },
    orderBy: { turnNumber: "desc" },
  });

  await prisma.referenceMove.create({
    data: { gameId, turnNumber: (last?.turnNumber ?? 0) + 1, ...data },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/parties/${gameId}`);
  notifyTournamentUpdate(tournamentId);
}

export async function updateReferenceMoveAction(
  tournamentId: string,
  gameId: string,
  moveId: string,
  formData: FormData
) {
  await assertCanManage(tournamentId);
  const data = parseReferenceMove(formData);
  if (!data) return;

  await prisma.referenceMove.update({ where: { id: moveId }, data });

  revalidatePath(`/admin/tournois/${tournamentId}/parties/${gameId}`);
  notifyTournamentUpdate(tournamentId);
}

export async function deleteReferenceMoveAction(
  tournamentId: string,
  gameId: string,
  moveId: string
) {
  await assertCanManage(tournamentId);
  await prisma.referenceMove.delete({ where: { id: moveId } });

  revalidatePath(`/admin/tournois/${tournamentId}/parties/${gameId}`);
  notifyTournamentUpdate(tournamentId);
}
