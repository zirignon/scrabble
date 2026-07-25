"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { notifyTournamentUpdate } from "@/lib/displayEvents";
import {
  BOARD_SIZE,
  computeMoveScore,
  getFreeAvertissementCount,
  getBingoRules,
  getFormulaTimerSeconds,
  parseReference,
  buildPlainBoard,
} from "@/lib/duplicate/board";
import { findWordSolutions, type SolverSolution } from "@/lib/duplicate/solver";

const movePenaltyValues = ["AVERTISSEMENT", "PENALITE", "ZERO"] as const;

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
    data: {
      tournamentId,
      number: (last?.number ?? 0) + 1,
      timerDurationSeconds: getFormulaTimerSeconds(tournament.duplicateFormula),
    },
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

// Recalcule le score et la pénalité d'un joueur pour une partie à partir de
// ses coups : la pénalité n'est plus saisie à la main dès qu'un coup est
// détaillé — elle découle des pénalités d'arbitrage posées sur les coups
// (une PENALITE coûte 5 points ; les AVERTISSEMENT sont gratuits jusqu'à un
// certain nombre selon la formule du tournoi, puis chaque avertissement
// supplémentaire coûte 5 points).
async function recomputeGameScore(gameId: string, playerId: string) {
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { tournament: true },
  });
  const moves = await prisma.duplicateMove.findMany({
    where: { gameId, playerId },
    select: { points: true, penaltyType: true },
  });
  const score = moves.reduce((sum, m) => sum + m.points, 0);

  const freeAvertissements = getFreeAvertissementCount(game.tournament.duplicateFormula);
  const avertissementCount = moves.filter((m) => m.penaltyType === "AVERTISSEMENT").length;
  const penaliteCount = moves.filter((m) => m.penaltyType === "PENALITE").length;
  const penalty =
    penaliteCount * 5 + Math.max(0, avertissementCount - freeAvertissements) * 5;

  await prisma.duplicateResult.upsert({
    where: { gameId_playerId: { gameId, playerId } },
    update: { score, penalty },
    create: { gameId, playerId, score, penalty },
  });
}

const moveSchema = z.object({
  rack: z.string().optional(),
  word: z.string().optional(),
  points: z.string().optional(),
  top: z.string().optional(),
  isPass: z.string().optional(),
  penaltyType: z.string().optional(),
});

function parseMovePenaltyType(formData: FormData) {
  const raw = formData.get("penaltyType");
  return typeof raw === "string" && movePenaltyValues.includes(raw as never)
    ? (raw as (typeof movePenaltyValues)[number])
    : null;
}

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
  const penaltyType = parseMovePenaltyType(formData);
  const points = penaltyType === "ZERO" ? 0 : parsed.data.points ? Number(parsed.data.points) : 0;

  await prisma.duplicateMove.create({
    data: {
      gameId,
      playerId,
      turnNumber: (last?.turnNumber ?? 0) + 1,
      rack: parsed.data.rack?.toUpperCase() || null,
      word,
      points,
      top: parsed.data.top ? Number(parsed.data.top) : null,
      isPass,
      penaltyType,
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
  const penaltyType = parseMovePenaltyType(formData);
  const points = penaltyType === "ZERO" ? 0 : parsed.data.points ? Number(parsed.data.points) : 0;

  const move = await prisma.duplicateMove.update({
    where: { id: moveId },
    data: {
      rack: parsed.data.rack?.toUpperCase() || null,
      word,
      points,
      top: parsed.data.top ? Number(parsed.data.top) : null,
      isPass,
      penaltyType,
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
  reference: z.string().min(2),
  word: z.string().optional(),
  rack: z.string().optional(),
  isPass: z.string().optional(),
});

function parseReferenceMove(formData: FormData) {
  const parsed = referenceMoveSchema.safeParse({
    reference: formData.get("reference"),
    word: formData.get("word") || undefined,
    rack: formData.get("rack") || undefined,
    isPass: formData.get("isPass") || undefined,
  });
  if (!parsed.success) return null;

  const position = parseReference(parsed.data.reference);
  if (!position) return null;

  return {
    row: position.row,
    col: position.col,
    direction: position.direction,
    // La casse est préservée (une minuscule signale une lettre blanche /
    // joker, voir computeMoveScore) — contrairement au coup par coup de
    // chaque joueur, dont le score n'est pas recalculé automatiquement.
    word: parsed.data.word || null,
    rack: parsed.data.rack?.toUpperCase() || null,
    isPass: parsed.data.isPass === "on",
  };
}

// Recalcule et enregistre le score de chaque coup de référence de la
// partie, dans l'ordre des tours : les bonus de lettre/mot ne s'appliquent
// qu'aux cases nouvellement posées à chaque coup, donc tout changement
// (ajout, modification, suppression) doit être répercuté sur les coups
// suivants qui en dépendent.
async function recomputeReferenceMoveScores(gameId: string) {
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { tournament: true },
  });
  const bingoRules = getBingoRules(game.tournament.duplicateFormula);

  const moves = await prisma.referenceMove.findMany({
    where: { gameId },
    orderBy: { turnNumber: "asc" },
  });

  const board: (string | null)[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(null)
  );

  for (const move of moves) {
    if (move.isPass || !move.word) continue;

    const boardBefore = board.map((row) => [...row]);
    const score = computeMoveScore(
      boardBefore,
      move.word,
      move.row,
      move.col,
      move.direction as "ACROSS" | "DOWN",
      bingoRules
    );
    if (score !== move.points) {
      await prisma.referenceMove.update({ where: { id: move.id }, data: { points: score } });
    }

    for (let i = 0; i < move.word.length; i++) {
      const r = move.direction === "DOWN" ? move.row - 1 + i : move.row - 1;
      const c = move.direction === "ACROSS" ? move.col - 1 + i : move.col - 1;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
      board[r][c] = move.word[i].toUpperCase();
    }
  }
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
    data: { gameId, turnNumber: (last?.turnNumber ?? 0) + 1, points: 0, ...data },
  });
  await recomputeReferenceMoveScores(gameId);

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

  const move = await prisma.referenceMove.update({ where: { id: moveId }, data });
  await recomputeReferenceMoveScores(move.gameId);

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
  await recomputeReferenceMoveScores(gameId);

  revalidatePath(`/admin/tournois/${tournamentId}/parties/${gameId}`);
  notifyTournamentUpdate(tournamentId);
}

// Cherche, pour le tirage saisi, tous les coups valides jouables sur la
// grille actuelle d'après le dictionnaire importé (ODS9 ou autre), triés
// par points décroissants — pour que l'arbitre choisisse un mot au lieu de
// le chercher lui-même. Renvoie un tableau vide si le dictionnaire n'a pas
// été importé.
export async function findReferenceMoveSolutionsAction(
  tournamentId: string,
  gameId: string,
  rack: string
): Promise<SolverSolution[]> {
  await assertCanManage(tournamentId);
  if (!rack.trim()) return [];

  const dictionaryCount = await prisma.dictionaryWord.count();
  if (dictionaryCount === 0) return [];

  const [game, dictionaryWords] = await Promise.all([
    prisma.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { tournament: true, referenceMoves: true },
    }),
    prisma.dictionaryWord.findMany({ select: { word: true } }),
  ]);

  const board = buildPlainBoard(game.referenceMoves);
  const dictionary = new Set(dictionaryWords.map((w) => w.word));
  const bingoRules = getBingoRules(game.tournament.duplicateFormula);

  return findWordSolutions(board, rack, dictionary, bingoRules, 30);
}
