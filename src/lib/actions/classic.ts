"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { generateRoundRobinRounds } from "@/lib/classic/pairing";
import { generateSwissRound } from "@/lib/classic/swiss";
import { computeClassicStandings } from "@/lib/classic/standings";
import { computeClassicTeamStandings } from "@/lib/classic/teamStandings";
import {
  generateKnockoutFirstRound,
  getKnockoutWinner,
  pairKnockoutWinners,
} from "@/lib/classic/knockout";

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

type TeamWithMembers = {
  id: string;
  members: { playerId: string }[];
};

// Crée les matchs d'une confrontation d'équipes (un par échiquier), ou un
// unique match marqué "bye" si l'équipe est exempte pour cette ronde.
// Factorisé car utilisé par le round-robin, le suisse et l'élimination
// directe par équipes.
async function createTeamEncounterMatches(
  roundId: string,
  homeTeam: TeamWithMembers,
  awayTeam: TeamWithMembers | null,
  boardCount: number,
  poolId?: string
) {
  if (!awayTeam) {
    await prisma.match.create({
      data: { roundId, poolId, homeTeamId: homeTeam.id, isBye: true, status: "PLAYED" },
    });
    return;
  }

  for (let board = 0; board < boardCount; board++) {
    await prisma.match.create({
      data: {
        roundId,
        poolId,
        table: board + 1,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homePlayerId: homeTeam.members[board].playerId,
        awayPlayerId: awayTeam.members[board].playerId,
        status: "SCHEDULED",
      },
    });
  }
}

export async function generateRoundRobinAction(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC") throw new Error("Tournoi non classique.");
  if (tournament.isTeamEvent) {
    throw new Error("Ce tournoi est en mode équipes : générez les rondes par équipes.");
  }

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

export async function generateTeamRoundRobinAction(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || !tournament.isTeamEvent) {
    throw new Error("Ce tournoi n'est pas un tournoi par équipes classique.");
  }

  const existing = await prisma.round.count({ where: { tournamentId } });
  if (existing > 0) throw new Error("Des rondes existent déjà pour ce tournoi.");

  const teams = await prisma.team.findMany({
    where: { tournamentId },
    include: { members: { orderBy: { board: "asc" } } },
  });
  if (teams.length < 2) throw new Error("Il faut au moins 2 équipes.");

  const boardCount = teams[0].members.length;
  if (boardCount === 0) throw new Error("Chaque équipe doit avoir au moins un joueur.");
  if (teams.some((t) => t.members.length !== boardCount)) {
    throw new Error("Toutes les équipes doivent avoir le même nombre de joueurs.");
  }

  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const teamRounds = generateRoundRobinRounds(teams.map((t) => t.id));

  for (let i = 0; i < teamRounds.length; i++) {
    const round = await prisma.round.create({
      data: { tournamentId, number: i + 1 },
    });

    for (const pairing of teamRounds[i]) {
      const homeTeam = teamsById.get(pairing.home)!;

      if (pairing.away === null) {
        await prisma.match.create({
          data: {
            roundId: round.id,
            homeTeamId: homeTeam.id,
            isBye: true,
            status: "PLAYED",
          },
        });
        continue;
      }

      const awayTeam = teamsById.get(pairing.away)!;
      for (let board = 0; board < boardCount; board++) {
        await prisma.match.create({
          data: {
            roundId: round.id,
            table: board + 1,
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            homePlayerId: homeTeam.members[board].playerId,
            awayPlayerId: awayTeam.members[board].playerId,
            status: "SCHEDULED",
          },
        });
      }
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

export async function generateNextTeamSwissRoundAction(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || !tournament.isTeamEvent || tournament.format !== "SWISS") {
    throw new Error("Ce tournoi n'est pas un tournoi par équipes en système suisse.");
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

  const teams = await prisma.team.findMany({
    where: { tournamentId },
    include: { members: { orderBy: { board: "asc" } } },
  });
  if (teams.length < 2) throw new Error("Il faut au moins 2 équipes.");

  const boardCount = teams[0].members.length;
  if (boardCount === 0) throw new Error("Chaque équipe doit avoir au moins un joueur.");
  if (teams.some((t) => t.members.length !== boardCount)) {
    throw new Error("Toutes les équipes doivent avoir le même nombre de joueurs.");
  }
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  const teamStandings = await computeClassicTeamStandings(tournamentId);

  const previousOpponents = new Map<string, Set<string>>();
  const teamsWithBye = new Set<string>();
  for (const m of previousMatches) {
    if (m.isBye) {
      if (m.homeTeamId) teamsWithBye.add(m.homeTeamId);
      continue;
    }
    if (!m.homeTeamId || !m.awayTeamId) continue;
    if (!previousOpponents.has(m.homeTeamId)) previousOpponents.set(m.homeTeamId, new Set());
    if (!previousOpponents.has(m.awayTeamId)) previousOpponents.set(m.awayTeamId, new Set());
    previousOpponents.get(m.homeTeamId)!.add(m.awayTeamId);
    previousOpponents.get(m.awayTeamId)!.add(m.homeTeamId);
  }

  const pairings = generateSwissRound(
    teamStandings.map((s) => ({ playerId: s.teamId, matchPoints: s.matchPoints })),
    previousOpponents,
    teamsWithBye
  );

  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
  });
  const round = await prisma.round.create({
    data: { tournamentId, number: (last?.number ?? 0) + 1 },
  });

  for (const pairing of pairings) {
    const homeTeam = teamsById.get(pairing.home)!;

    if (pairing.away === null) {
      await prisma.match.create({
        data: {
          roundId: round.id,
          homeTeamId: homeTeam.id,
          isBye: true,
          status: "PLAYED",
        },
      });
      continue;
    }

    const awayTeam = teamsById.get(pairing.away)!;
    for (let board = 0; board < boardCount; board++) {
      await prisma.match.create({
        data: {
          roundId: round.id,
          table: board + 1,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          homePlayerId: homeTeam.members[board].playerId,
          awayPlayerId: awayTeam.members[board].playerId,
          status: "SCHEDULED",
        },
      });
    }
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
}

export async function generatePoolsRoundRobinAction(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || tournament.format !== "GROUPS") {
    throw new Error("Ce tournoi n'est pas au format poules.");
  }
  if (tournament.isTeamEvent) {
    throw new Error("Ce tournoi est en mode équipes : générez les poules par équipes.");
  }

  const existing = await prisma.round.count({ where: { tournamentId } });
  if (existing > 0) throw new Error("Des rondes existent déjà pour ce tournoi.");

  const pools = await prisma.pool.findMany({
    where: { tournamentId },
    include: { members: true },
  });
  if (pools.length === 0) throw new Error("Créez au moins une poule avec des joueurs.");
  if (pools.some((p) => p.members.length < 2)) {
    throw new Error("Chaque poule doit compter au moins 2 joueurs.");
  }

  async function getOrCreateRound(number: number) {
    return prisma.round.upsert({
      where: { tournamentId_number: { tournamentId, number } },
      update: {},
      create: { tournamentId, number },
    });
  }

  // Chaque poule joue son propre round-robin interne ; la ronde N d'une
  // poule partage le même numéro de ronde tournoi que la ronde N des
  // autres poules (elles se jouent en parallèle). Une poule plus petite
  // termine simplement plus tôt, sans matchs dans les rondes suivantes.
  for (const pool of pools) {
    const poolRounds = generateRoundRobinRounds(pool.members.map((m) => m.playerId));
    for (let i = 0; i < poolRounds.length; i++) {
      const round = await getOrCreateRound(i + 1);
      let table = 1;
      for (const pairing of poolRounds[i]) {
        await prisma.match.create({
          data: {
            roundId: round.id,
            poolId: pool.id,
            table: pairing.away ? table++ : null,
            homePlayerId: pairing.home,
            awayPlayerId: pairing.away,
            isBye: pairing.away === null,
            status: pairing.away === null ? "PLAYED" : "SCHEDULED",
          },
        });
      }
    }
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
}

export async function generateTeamPoolsRoundRobinAction(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || tournament.format !== "GROUPS" || !tournament.isTeamEvent) {
    throw new Error("Ce tournoi n'est pas un tournoi par équipes en poules.");
  }

  const existing = await prisma.round.count({ where: { tournamentId } });
  if (existing > 0) throw new Error("Des rondes existent déjà pour ce tournoi.");

  const pools = await prisma.pool.findMany({
    where: { tournamentId },
    include: { teams: { include: { members: { orderBy: { board: "asc" } } } } },
  });
  if (pools.length === 0) throw new Error("Créez au moins une poule avec des équipes.");
  if (pools.some((p) => p.teams.length < 2)) {
    throw new Error("Chaque poule doit compter au moins 2 équipes.");
  }

  const allTeams = pools.flatMap((p) => p.teams);
  const boardCount = allTeams[0]?.members.length ?? 0;
  if (boardCount === 0) throw new Error("Chaque équipe doit avoir au moins un joueur.");
  if (allTeams.some((t) => t.members.length !== boardCount)) {
    throw new Error("Toutes les équipes doivent avoir le même nombre de joueurs.");
  }

  async function getOrCreateRound(number: number) {
    return prisma.round.upsert({
      where: { tournamentId_number: { tournamentId, number } },
      update: {},
      create: { tournamentId, number },
    });
  }

  for (const pool of pools) {
    const teamsById = new Map(pool.teams.map((t) => [t.id, t]));
    const teamRounds = generateRoundRobinRounds(pool.teams.map((t) => t.id));
    for (let i = 0; i < teamRounds.length; i++) {
      const round = await getOrCreateRound(i + 1);
      for (const pairing of teamRounds[i]) {
        const homeTeam = teamsById.get(pairing.home)!;
        const awayTeam = pairing.away ? teamsById.get(pairing.away)! : null;
        await createTeamEncounterMatches(round.id, homeTeam, awayTeam, boardCount, pool.id);
      }
    }
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
}

export async function generateKnockoutBracketAction(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || tournament.format !== "KNOCKOUT") {
    throw new Error("Ce tournoi n'est pas au format élimination directe.");
  }
  if (tournament.isTeamEvent) {
    throw new Error("Ce tournoi est en mode équipes : générez le tableau par équipes.");
  }

  const existing = await prisma.round.count({ where: { tournamentId } });
  if (existing > 0) throw new Error("Le tableau a déjà été généré pour ce tournoi.");

  const registrations = await prisma.registration.findMany({
    where: { tournamentId, status: "CONFIRMED" },
    select: { playerId: true },
  });
  const playerIds = registrations.map((r) => r.playerId);
  if (playerIds.length < 2) throw new Error("Il faut au moins 2 joueurs inscrits.");

  const pairings = generateKnockoutFirstRound(playerIds);
  const round = await prisma.round.create({ data: { tournamentId, number: 1 } });

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

export async function generateNextKnockoutRoundAction(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || tournament.format !== "KNOCKOUT") {
    throw new Error("Ce tournoi n'est pas au format élimination directe.");
  }

  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
    include: { matches: true },
  });
  if (!last) throw new Error("Générez d'abord le tableau initial.");

  const winners: string[] = [];
  for (const match of last.matches) {
    const winner = getKnockoutWinner(match);
    if (!winner) {
      throw new Error(
        `Le résultat de la table ${match.table ?? "?"} n'est pas encore tranché (terminez la saisie ou résolvez l'égalité avant de continuer).`
      );
    }
    winners.push(winner);
  }

  if (winners.length === 1) {
    throw new Error("Le tournoi est terminé : la finale a déjà été jouée.");
  }

  const pairings = pairKnockoutWinners(winners);
  const round = await prisma.round.create({
    data: { tournamentId, number: last.number + 1 },
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

export async function generateTeamKnockoutBracketAction(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || tournament.format !== "KNOCKOUT" || !tournament.isTeamEvent) {
    throw new Error("Ce tournoi n'est pas une élimination directe par équipes.");
  }

  const existing = await prisma.round.count({ where: { tournamentId } });
  if (existing > 0) throw new Error("Le tableau a déjà été généré pour ce tournoi.");

  const teams = await prisma.team.findMany({
    where: { tournamentId },
    include: { members: { orderBy: { board: "asc" } } },
  });
  if (teams.length < 2) throw new Error("Il faut au moins 2 équipes.");

  const boardCount = teams[0].members.length;
  if (boardCount === 0) throw new Error("Chaque équipe doit avoir au moins un joueur.");
  if (teams.some((t) => t.members.length !== boardCount)) {
    throw new Error("Toutes les équipes doivent avoir le même nombre de joueurs.");
  }

  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const pairings = generateKnockoutFirstRound(teams.map((t) => t.id));
  const round = await prisma.round.create({ data: { tournamentId, number: 1 } });

  for (const pairing of pairings) {
    const homeTeam = teamsById.get(pairing.home)!;
    const awayTeam = pairing.away ? teamsById.get(pairing.away)! : null;
    await createTeamEncounterMatches(round.id, homeTeam, awayTeam, boardCount);
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
}

export async function generateNextTeamKnockoutRoundAction(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || tournament.format !== "KNOCKOUT" || !tournament.isTeamEvent) {
    throw new Error("Ce tournoi n'est pas une élimination directe par équipes.");
  }

  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
    include: { matches: true },
  });
  if (!last) throw new Error("Générez d'abord le tableau initial.");

  // Regroupe les échiquiers du dernier tour par confrontation (paire
  // d'équipes) pour déterminer le vainqueur de chacune à la majorité
  // d'échiquiers gagnés, dans l'ordre où les confrontations apparaissent.
  const winners: string[] = [];
  const seenKeys = new Set<string>();

  for (const match of last.matches) {
    if (match.isBye) {
      if (match.homeTeamId && !seenKeys.has(match.homeTeamId)) {
        seenKeys.add(match.homeTeamId);
        winners.push(match.homeTeamId);
      }
      continue;
    }
    if (!match.homeTeamId || !match.awayTeamId) continue;
    const key = `${match.homeTeamId}:${match.awayTeamId}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const boards = last.matches.filter(
      (m) => m.homeTeamId === match.homeTeamId && m.awayTeamId === match.awayTeamId
    );
    const allDecided = boards.every((b) => b.status !== "SCHEDULED");
    if (!allDecided) {
      throw new Error(
        "Une confrontation n'est pas encore terminée : terminez la saisie des échiquiers avant de continuer."
      );
    }

    let homeBoardsWon = 0;
    let awayBoardsWon = 0;
    for (const board of boards) {
      if (board.status === "PLAYED" && board.homeScore != null && board.awayScore != null) {
        if (board.homeScore > board.awayScore) homeBoardsWon += 1;
        else if (board.homeScore < board.awayScore) awayBoardsWon += 1;
      } else if (board.status === "FORFEIT_HOME") {
        awayBoardsWon += 1;
      } else if (board.status === "FORFEIT_AWAY") {
        homeBoardsWon += 1;
      }
    }

    if (homeBoardsWon === awayBoardsWon) {
      throw new Error(
        "Égalité aux échiquiers pour une confrontation : elle doit être départagée manuellement avant de continuer."
      );
    }
    winners.push(homeBoardsWon > awayBoardsWon ? match.homeTeamId : match.awayTeamId);
  }

  if (winners.length === 1) {
    throw new Error("Le tournoi est terminé : la finale a déjà été jouée.");
  }

  const teams = await prisma.team.findMany({
    where: { tournamentId },
    include: { members: { orderBy: { board: "asc" } } },
  });
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const boardCount = teams[0].members.length;

  const pairings = pairKnockoutWinners(winners);
  const round = await prisma.round.create({
    data: { tournamentId, number: last.number + 1 },
  });

  for (const pairing of pairings) {
    const homeTeam = teamsById.get(pairing.home)!;
    const awayTeam = pairing.away ? teamsById.get(pairing.away)! : null;
    await createTeamEncounterMatches(round.id, homeTeam, awayTeam, boardCount);
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
