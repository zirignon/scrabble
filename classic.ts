"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { generateRoundRobinRounds } from "@/lib/classic/pairing";
import { generateSwissRound } from "@/lib/classic/swiss";
import { computeClassicStandings } from "@/lib/classic/standings";

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

export async function generateRoundRobinAction(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC") throw new Error("Tournoi non classique.");

  const existing = await prisma.round.count({ where: { tournamentId } });
  if (existing > 0) throw new Error("Des rondes existent déjà pour ce tournoi.");

  const registrations = await prisma.registration.findMany({
    where: { tournamentId, status: "CONFIRMED" },
    select: { playerId: true },
  });
  const playerIds = registrations.map((r) => r.playerId);
  if (playerIds.length < 2) throw new Error("Il faut au moins 2 joueurs inscrits.");

  const rounds = generateRoundRobinRounds(playerIds);

  for (let i = 0; i < rounds.length; i++) {
    const round = await prisma.round.create({
      data: { tournamentId, number: i + 1 },
    });
    let table = 1;
    for (const pairing of rounds[i]) {
      await prisma.match.create({
        data: {
          roundId: round.id,
          table: pairing.away ? table++ : null,
          homePlayerId: pairing.home,
          awayPlayerId: pairing.away,
          isBye: pairing.away === null,
          status: pairing.away === null ? "PLAYED" : "SCHEDULED",
        },
      });
    }
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
}

export async function generateNextSwissRoundAction(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || tournament.format !== "SWISS") {
    throw new Error("Ce tournoi n'est pas en format suisse.");
  }

  const previousMatches = await prisma.match.findMany({
    where: { round: { tournamentId } },
  });

  const unfinished = previousMatches.some(
    (m) => !m.isBye && m.homePlayerId && m.awayPlayerId && m.status === "SCHEDULED"
  );
  if (unfinished) {
    throw new Error("Terminez la saisie des résultats de la ronde en cours avant d'en générer une nouvelle.");
  }

  const standings = await computeClassicStandings(tournamentId);
  if (standings.length < 2) throw new Error("Il faut au moins 2 joueurs inscrits.");

  const previousOpponents = new Map<string, Set<string>>();
  const playersWithBye = new Set<string>();
  for (const m of previousMatches) {
    if (m.isBye) {
      if (m.homePlayerId) playersWithBye.add(m.homePlayerId);
      continue;
    }
    if (!m.homePlayerId || !m.awayPlayerId) continue;
    if (!previousOpponents.has(m.homePlayerId)) previousOpponents.set(m.homePlayerId, new Set());
    if (!previousOpponents.has(m.awayPlayerId)) previousOpponents.set(m.awayPlayerId, new Set());
    previousOpponents.get(m.homePlayerId)!.add(m.awayPlayerId);
    previousOpponents.get(m.awayPlayerId)!.add(m.homePlayerId);
  }

  const pairings = generateSwissRound(
    standings.map((s) => ({ playerId: s.playerId, matchPoints: s.matchPoints })),
    previousOpponents,
    playersWithBye
  );

  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
  });
  const round = await prisma.round.create({
    data: { tournamentId, number: (last?.number ?? 0) + 1 },
  });

  let table = 1;
  for (const pairing of pairings) {
    await prisma.match.create({
      data: {
        roundId: round.id,
        table: pairing.away ? table++ : null,
        homePlayerId: pairing.home,
        awayPlayerId: pairing.away,
        isBye: pairing.away === null,
        status: pairing.away === null ? "PLAYED" : "SCHEDULED",
      },
    });
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
}

export async function addManualRoundAction(tournamentId: string) {
  await assertCanManage(tournamentId);
  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
  });
  await prisma.round.create({
    data: { tournamentId, number: (last?.number ?? 0) + 1 },
  });
  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
}

const addMatchSchema = z.object({
  homePlayerId: z.string().min(1),
  awayPlayerId: z.string().min(1),
  table: z.string().optional(),
});

export async function addMatchAction(
  tournamentId: string,
  roundId: string,
  formData: FormData
) {
  await assertCanManage(tournamentId);
  const parsed = addMatchSchema.safeParse({
    homePlayerId: formData.get("homePlayerId"),
    awayPlayerId: formData.get("awayPlayerId"),
    table: formData.get("table") || undefined,
  });
  if (!parsed.success) return;
  if (parsed.data.homePlayerId === parsed.data.awayPlayerId) return;

  await prisma.match.create({
    data: {
      roundId,
      homePlayerId: parsed.data.homePlayerId,
      awayPlayerId: parsed.data.awayPlayerId,
      table: parsed.data.table ? Number(parsed.data.table) : null,
      status: "SCHEDULED",
    },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
}

const resultSchema = z.object({
  homeScore: z.string().optional(),
  awayScore: z.string().optional(),
  status: z.enum([
    "SCHEDULED",
    "PLAYED",
    "FORFEIT_HOME",
    "FORFEIT_AWAY",
    "CANCELLED",
  ]),
});

export async function recordMatchResultAction(
  tournamentId: string,
  matchId: string,
  formData: FormData
) {
  await assertCanManage(tournamentId);
  const parsed = resultSchema.safeParse({
    homeScore: formData.get("homeScore") || undefined,
    awayScore: formData.get("awayScore") || undefined,
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  await prisma.match.update({
    where: { id: matchId },
    data: {
      homeScore: parsed.data.homeScore ? Number(parsed.data.homeScore) : null,
      awayScore: parsed.data.awayScore ? Number(parsed.data.awayScore) : null,
      status: parsed.data.status,
    },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
  revalidatePath(`/tournois`);
}
