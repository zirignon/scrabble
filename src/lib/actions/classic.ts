"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { generateRoundRobinRounds } from "@/lib/classic/pairing";
import { generateSwissRound, generateSwissRoundWithForfeits, seedFirstSwissRound } from "@/lib/classic/swiss";
import { computeClassicStandings, computeClassicSwissPhaseStandings } from "@/lib/classic/standings";
import {
  computeClassicTeamStandings,
  computeClassicTeamSwissPhaseStandings,
} from "@/lib/classic/teamStandings";
import {
  computeClassicGeneralPoolStandings,
  computeClassicPoolStandings,
  selectPoolQualifiers,
} from "@/lib/classic/poolStandings";
import {
  computeClassicTeamGeneralPoolStandings,
  computeClassicTeamPoolStandings,
} from "@/lib/classic/teamPoolStandings";
import {
  crossSeedTwoPools,
  generateKnockoutFirstRound,
  getKnockoutWinner,
  pairKnockoutWinners,
  standardBracketSeeding,
} from "@/lib/classic/knockout";
import type { Pairing } from "@/lib/classic/pairing";
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

// Next.js redacte le message des erreurs levées par une Server Action en
// production (sécurité), ne laissant qu'un message générique côté client —
// ce qui masque les erreurs de validation volontaires (équipes de tailles
// différentes, ronde en cours non terminée...) qui sont pourtant sûres à
// afficher. Ce wrapper capture l'erreur côté serveur et la renvoie comme
// donnée normale (`{ error }`) plutôt que de la laisser traverser la
// frontière Server Action, pour qu'elle arrive intacte jusqu'à l'UI.
function safeRoundAction<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void>
): (...args: Args) => Promise<{ error?: string }> {
  return async (...args: Args) => {
    try {
      await fn(...args);
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Une erreur est survenue." };
    }
  };
}

type TeamWithMembers = {
  id: string;
  members: { playerId: string }[];
};

// Crée les matchs d'une confrontation d'équipes (un par échiquier), ou un
// unique match marqué "bye" si l'équipe est exempte pour cette ronde.
// Factorisé car utilisé par le round-robin, le suisse et l'élimination
// directe par équipes.
// Numéros de table alloués en continu sur toute la ronde (1, 2, 3...),
// partagés entre toutes les confrontations (et toutes les poules) qui s'y
// jouent en parallèle — mêmes tables physiques, même tournoi.
type TableCounter = { next: () => number };

function createTableCounter(start = 1): TableCounter {
  let n = start;
  return { next: () => n++ };
}

async function createTeamEncounterMatches(
  roundId: string,
  homeTeam: TeamWithMembers,
  awayTeam: TeamWithMembers | null,
  boardCount: number,
  tableCounter: TableCounter,
  poolId?: string,
  isThirdPlace = false
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
        table: tableCounter.next(),
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homePlayerId: homeTeam.members[board].playerId,
        awayPlayerId: awayTeam.members[board].playerId,
        status: "SCHEDULED",
        isThirdPlace,
        // Alterne qui débute d'un échiquier à l'autre au sein de la même
        // confrontation (échiquier 1 : domicile débute, échiquier 2 :
        // extérieur débute, etc.) pour équilibrer les débuts de partie
        // entre les deux équipes.
        homeStarts: board % 2 === 0,
      },
    });
  }
}

// Calendrier de rondes round-robin pas encore matérialisées en base, tel
// que stocké dans les colonnes JSON Tournament/Pool.pendingRoundRobinSchedule.
type PendingSchedule = Pairing[][];

function schedulePending(schedule: PendingSchedule): PendingSchedule | null {
  return schedule.length > 0 ? schedule : null;
}

// Révèle automatiquement la ronde suivante d'un round-robin (individuel,
// équipes, ou poules) dès que tous les matchs de la ronde en cours sont
// tranchés. Le calendrier complet est calculé une seule fois à la
// génération (generateRoundRobinRounds est déterministe, indépendant des
// résultats) mais matérialisé une ronde à la fois, pour que l'écran public
// — qui affiche toujours la dernière ronde en base, voir buildCurrent dans
// src/lib/display.ts — suive la partie réellement en train de se jouer au
// lieu de sauter direct à la dernière ronde du calendrier. Sans effet pour
// le suisse (déjà généré ronde par ronde) et l'élimination directe
// (génération manuelle intentionnelle).
async function maybeAdvanceRoundRobin(tournamentId: string, roundId: string) {
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
  if (
    tournament.format !== "ROUND_ROBIN" &&
    tournament.format !== "GROUPS" &&
    tournament.format !== "COMBINED"
  ) {
    return;
  }

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { matches: true },
  });
  if (!round || round.isFinalPhase) return;

  // Ne réagit qu'à la fin de la ronde la plus récente du tournoi — une
  // correction rétroactive du score d'une ancienne ronde ne doit rien
  // déclencher (la ronde suivante existe déjà).
  const lastRound = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
  });
  if (lastRound?.id !== round.id) return;

  const stillPlaying = round.matches.some(
    (m) => !m.isBye && m.homePlayerId && m.awayPlayerId && m.status === "SCHEDULED"
  );
  if (stillPlaying) return;

  if (tournament.format === "ROUND_ROBIN") {
    const schedule = (tournament.pendingRoundRobinSchedule as PendingSchedule | null) ?? [];
    if (schedule.length === 0) return;
    const [nextPairings, ...rest] = schedule;

    const nextRound = await prisma.round.create({
      data: { tournamentId, number: round.number + 1 },
    });

    if (tournament.isTeamEvent) {
      const teams = await prisma.team.findMany({
        where: { tournamentId },
        include: { members: { orderBy: { board: "asc" } } },
      });
      const teamsById = new Map(teams.map((t) => [t.id, t]));
      const boardCount = teams[0]?.members.length ?? 0;
      const tableCounter = createTableCounter();
      for (const pairing of nextPairings) {
        const homeTeam = teamsById.get(pairing.home)!;
        const awayTeam = pairing.away ? teamsById.get(pairing.away)! : null;
        await createTeamEncounterMatches(nextRound.id, homeTeam, awayTeam, boardCount, tableCounter);
      }
    } else {
      let table = 1;
      for (const pairing of nextPairings) {
        await prisma.match.create({
          data: {
            roundId: nextRound.id,
            table: pairing.away ? table++ : null,
            homePlayerId: pairing.home,
            awayPlayerId: pairing.away,
            isBye: pairing.away === null,
            status: pairing.away === null ? "PLAYED" : "SCHEDULED",
          },
        });
      }
    }

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { pendingRoundRobinSchedule: schedulePending(rest) ?? Prisma.JsonNull },
    });
    return;
  }

  // GROUPS : une ronde de poules a toujours au moins un match avec poolId —
  // sans quoi c'est la phase finale à élimination directe générée après les
  // poules (poolId null), sans lien avec ce mécanisme.
  if (!round.matches.some((m) => m.poolId)) return;

  const pools = await prisma.pool.findMany({ where: { tournamentId } });
  const poolsWithPending = pools.filter((p) => {
    const schedule = p.pendingRoundRobinSchedule as PendingSchedule | null;
    return schedule && schedule.length > 0;
  });
  if (poolsWithPending.length === 0) return;

  let nextRound: { id: string } | null = null;
  let teamsById: Map<string, TeamWithMembers> | null = null;
  let boardCount = 0;
  if (tournament.isTeamEvent) {
    const teams = await prisma.team.findMany({
      where: { tournamentId },
      include: { members: { orderBy: { board: "asc" } } },
    });
    teamsById = new Map(teams.map((t) => [t.id, t]));
    boardCount = teams[0]?.members.length ?? 0;
  }

  // Numérotation de table continue sur toute la ronde (1, 2, 3...), pas
  // remise à 1 à chaque poule (ni, en équipes, à chaque confrontation) —
  // même tournoi, mêmes tables physiques.
  let table = 1;
  const tableCounter = createTableCounter();
  for (const pool of poolsWithPending) {
    const schedule = pool.pendingRoundRobinSchedule as PendingSchedule;
    const [nextPairings, ...rest] = schedule;
    if (!nextRound) {
      nextRound = await prisma.round.create({
        data: { tournamentId, number: round.number + 1 },
      });
    }
    if (tournament.isTeamEvent) {
      for (const pairing of nextPairings) {
        const homeTeam = teamsById!.get(pairing.home)!;
        const awayTeam = pairing.away ? teamsById!.get(pairing.away)! : null;
        await createTeamEncounterMatches(nextRound.id, homeTeam, awayTeam, boardCount, tableCounter, pool.id);
      }
    } else {
      for (const pairing of nextPairings) {
        await prisma.match.create({
          data: {
            roundId: nextRound.id,
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
    await prisma.pool.update({
      where: { id: pool.id },
      data: { pendingRoundRobinSchedule: schedulePending(rest) ?? Prisma.JsonNull },
    });
  }
}

async function generateRoundRobinActionImpl(tournamentId: string) {
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

  // Ronde 1 matérialisée tout de suite, le reste du calendrier révélé
  // automatiquement ronde après ronde au fur et à mesure des résultats —
  // voir maybeAdvanceRoundRobin.
  const round1 = await prisma.round.create({ data: { tournamentId, number: 1 } });
  let table = 1;
  for (const pairing of rounds[0]) {
    await prisma.match.create({
      data: {
        roundId: round1.id,
        table: pairing.away ? table++ : null,
        homePlayerId: pairing.home,
        awayPlayerId: pairing.away,
        isBye: pairing.away === null,
        status: pairing.away === null ? "PLAYED" : "SCHEDULED",
      },
    });
  }

  const pending = schedulePending(rounds.slice(1));
  if (pending) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { pendingRoundRobinSchedule: pending },
    });
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
  notifyTournamentUpdate(tournamentId);
}
export const generateRoundRobinAction = safeRoundAction(generateRoundRobinActionImpl);

async function generateTeamRoundRobinActionImpl(tournamentId: string) {
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

  // Ronde 1 matérialisée tout de suite, le reste révélé automatiquement au
  // fur et à mesure — voir maybeAdvanceRoundRobin.
  const round1 = await prisma.round.create({ data: { tournamentId, number: 1 } });
  const tableCounter = createTableCounter();
  for (const pairing of teamRounds[0]) {
    const homeTeam = teamsById.get(pairing.home)!;
    const awayTeam = pairing.away ? teamsById.get(pairing.away)! : null;
    await createTeamEncounterMatches(round1.id, homeTeam, awayTeam, boardCount, tableCounter);
  }

  const pending = schedulePending(teamRounds.slice(1));
  if (pending) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { pendingRoundRobinSchedule: pending },
    });
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
  notifyTournamentUpdate(tournamentId);
}
export const generateTeamRoundRobinAction = safeRoundAction(generateTeamRoundRobinActionImpl);

async function generateNextSwissRoundActionImpl(tournamentId: string) {
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

  const playersWithBye = new Set<string>();
  for (const m of previousMatches) {
    if (m.isBye && m.homePlayerId) playersWithBye.add(m.homePlayerId);
  }
  const meetingCounts = buildMeetingCounts(
    previousMatches
      .filter((m): m is typeof m & { homePlayerId: string; awayPlayerId: string } =>
        !m.isBye && m.homePlayerId !== null && m.awayPlayerId !== null
      )
      .map((m) => ({ home: m.homePlayerId, away: m.awayPlayerId }))
  );

  // Avant la ronde 1, tout le monde est à 0 point de match : le classement
  // ne peut pas encore départager les joueurs pour l'appariement. On
  // applique alors la méthode choisie par l'organisateur (tirage au sort ou
  // Elo classique) ; sans effet à partir de la ronde 2.
  let standingsForPairing = standings;
  if (previousMatches.length === 0) {
    const registrations = await prisma.registration.findMany({
      where: { tournamentId },
      select: { playerId: true, player: { select: { eloClassic: true } } },
    });
    const eloByPlayer = new Map(registrations.map((r) => [r.playerId, r.player.eloClassic]));
    standingsForPairing = seedFirstSwissRound(standings, tournament.swissSeeding, eloByPlayer);
  }

  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
  });

  // Un joueur forfait à la ronde qui vient de se terminer est probablement
  // encore absent : on l'envoie en bas du classement pour l'appariement et
  // on le fait rencontrer un autre forfait plutôt que d'imposer une
  // "victoire gratuite" à un joueur présent (voir generateSwissRoundWithForfeits).
  const forfeitedLastRound = new Set<string>();
  if (last) {
    const lastRoundMatches = previousMatches.filter((m) => m.roundId === last.id);
    for (const m of lastRoundMatches) {
      if (m.status === "FORFEIT_HOME" && m.homePlayerId) forfeitedLastRound.add(m.homePlayerId);
      if (m.status === "FORFEIT_AWAY" && m.awayPlayerId) forfeitedLastRound.add(m.awayPlayerId);
      if (m.status === "FORFEIT_BOTH") {
        if (m.homePlayerId) forfeitedLastRound.add(m.homePlayerId);
        if (m.awayPlayerId) forfeitedLastRound.add(m.awayPlayerId);
      }
    }
  }

  const upcomingRoundNumber = (last?.number ?? 0) + 1;
  // Revanches volontairement autorisées à partir de la ronde configurée
  // (voir Tournament.allowRematchesFromRound) : l'appariement tolère alors
  // une unique revanche par paire (deux rencontres au total), au lieu d'en
  // éviter toute trace comme d'habitude — jamais une 3e rencontre pour la
  // même paire, quelle que soit la ronde.
  const rematchesAllowed =
    tournament.allowRematchesFromRound !== null &&
    upcomingRoundNumber >= tournament.allowRematchesFromRound;
  const opponentsForPairing = deriveAvoidSet(meetingCounts, rematchesAllowed ? 2 : 1);

  const pairings = generateSwissRoundWithForfeits(
    standingsForPairing.map((s) => ({ playerId: s.playerId, matchPoints: s.matchPoints })),
    opponentsForPairing,
    playersWithBye,
    forfeitedLastRound
  );

  const round = await prisma.round.create({
    data: { tournamentId, number: upcomingRoundNumber },
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
  notifyTournamentUpdate(tournamentId);
}
export const generateNextSwissRoundAction = safeRoundAction(generateNextSwissRoundActionImpl);

async function generateNextTeamSwissRoundActionImpl(tournamentId: string) {
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
    include: {
      members: {
        orderBy: { board: "asc" },
        include: { player: { select: { eloClassic: true } } },
      },
    },
  });
  if (teams.length < 2) throw new Error("Il faut au moins 2 équipes.");

  const boardCount = teams[0].members.length;
  if (boardCount === 0) throw new Error("Chaque équipe doit avoir au moins un joueur.");
  if (teams.some((t) => t.members.length !== boardCount)) {
    throw new Error("Toutes les équipes doivent avoir le même nombre de joueurs.");
  }
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  const teamStandings = await computeClassicTeamStandings(tournamentId);

  // Avant la ronde 1, on départage les équipes soit par tirage au sort, soit
  // par force moyenne (moyenne des Elo classiques de l'équipe) — même
  // logique que pour le suisse individuel, voir plus haut.
  let teamStandingsForPairing = teamStandings.map((s) => ({
    playerId: s.teamId,
    matchPoints: s.matchPoints,
  }));
  if (previousMatches.length === 0) {
    const eloByTeam = new Map(
      teams.map((t) => {
        const elos = t.members
          .map((m) => m.player.eloClassic)
          .filter((elo): elo is number => elo != null);
        const average = elos.length > 0 ? elos.reduce((a, b) => a + b, 0) / elos.length : null;
        return [t.id, average];
      })
    );
    teamStandingsForPairing = seedFirstSwissRound(teamStandingsForPairing, tournament.swissSeeding, eloByTeam);
  }

  const teamsWithBye = new Set<string>();
  for (const m of previousMatches) {
    if (m.isBye && m.homeTeamId) teamsWithBye.add(m.homeTeamId);
  }
  // Une confrontation d'équipes occupe plusieurs lignes Match (un par
  // échiquier) : on déduplique par ronde + paire d'équipes pour qu'elle ne
  // compte que pour UNE rencontre, pas boardCount rencontres.
  const encounterKeys = new Set<string>();
  const teamMeetingPairs: { home: string; away: string }[] = [];
  for (const m of previousMatches) {
    if (m.isBye || !m.homeTeamId || !m.awayTeamId) continue;
    const key = `${m.roundId}:${m.homeTeamId}:${m.awayTeamId}`;
    if (encounterKeys.has(key)) continue;
    encounterKeys.add(key);
    teamMeetingPairs.push({ home: m.homeTeamId, away: m.awayTeamId });
  }
  const meetingCounts = buildMeetingCounts(teamMeetingPairs);

  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
  });
  const upcomingRoundNumber = (last?.number ?? 0) + 1;
  // Voir le commentaire équivalent dans generateNextSwissRoundActionImpl.
  const rematchesAllowed =
    tournament.allowRematchesFromRound !== null &&
    upcomingRoundNumber >= tournament.allowRematchesFromRound;
  const opponentsForPairing = deriveAvoidSet(meetingCounts, rematchesAllowed ? 2 : 1);

  const pairings = generateSwissRound(teamStandingsForPairing, opponentsForPairing, teamsWithBye);

  const round = await prisma.round.create({
    data: { tournamentId, number: upcomingRoundNumber },
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
  notifyTournamentUpdate(tournamentId);
}
export const generateNextTeamSwissRoundAction = safeRoundAction(generateNextTeamSwissRoundActionImpl);

async function generatePoolsRoundRobinActionImpl(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (
    tournament.type !== "CLASSIC" ||
    (tournament.format !== "GROUPS" && tournament.format !== "COMBINED")
  ) {
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
  // Seule la ronde 1 est matérialisée tout de suite, le reste révélé
  // automatiquement au fur et à mesure — voir maybeAdvanceRoundRobin.
  const round1 = await getOrCreateRound(1);
  // Numérotation de table continue sur toute la ronde (1, 2, 3...), pas
  // remise à 1 à chaque poule — même tournoi, mêmes tables physiques.
  let table = 1;
  for (const pool of pools) {
    const poolRounds = generateRoundRobinRounds(pool.members.map((m) => m.playerId));
    for (const pairing of poolRounds[0]) {
      await prisma.match.create({
        data: {
          roundId: round1.id,
          poolId: pool.id,
          table: pairing.away ? table++ : null,
          homePlayerId: pairing.home,
          awayPlayerId: pairing.away,
          isBye: pairing.away === null,
          status: pairing.away === null ? "PLAYED" : "SCHEDULED",
        },
      });
    }

    const pending = schedulePending(poolRounds.slice(1));
    if (pending) {
      await prisma.pool.update({
        where: { id: pool.id },
        data: { pendingRoundRobinSchedule: pending },
      });
    }
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
  notifyTournamentUpdate(tournamentId);
}
export const generatePoolsRoundRobinAction = safeRoundAction(generatePoolsRoundRobinActionImpl);

async function generateTeamPoolsRoundRobinActionImpl(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (
    tournament.type !== "CLASSIC" ||
    (tournament.format !== "GROUPS" && tournament.format !== "COMBINED") ||
    !tournament.isTeamEvent
  ) {
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

  // Seule la ronde 1 est matérialisée tout de suite, le reste révélé
  // automatiquement au fur et à mesure — voir maybeAdvanceRoundRobin.
  const round1 = await getOrCreateRound(1);
  // Numérotation de table continue sur toute la ronde, partagée entre les
  // poules — voir le commentaire équivalent côté individuel.
  const tableCounter = createTableCounter();
  for (const pool of pools) {
    const teamsById = new Map(pool.teams.map((t) => [t.id, t]));
    const teamRounds = generateRoundRobinRounds(pool.teams.map((t) => t.id));
    for (const pairing of teamRounds[0]) {
      const homeTeam = teamsById.get(pairing.home)!;
      const awayTeam = pairing.away ? teamsById.get(pairing.away)! : null;
      await createTeamEncounterMatches(round1.id, homeTeam, awayTeam, boardCount, tableCounter, pool.id);
    }

    const pending = schedulePending(teamRounds.slice(1));
    if (pending) {
      await prisma.pool.update({
        where: { id: pool.id },
        data: { pendingRoundRobinSchedule: pending },
      });
    }
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
  notifyTournamentUpdate(tournamentId);
}
export const generateTeamPoolsRoundRobinAction = safeRoundAction(generateTeamPoolsRoundRobinActionImpl);

// Nombre de fois où chaque paire d'entrants (joueurs ou équipes) s'est déjà
// rencontrée, à partir de la liste des confrontations déjà jouées. Sert de
// base à deriveAvoidSet ci-dessous plutôt que d'un simple ensemble
// "déjà affronté" (booléen), pour pouvoir distinguer une paire qui ne
// s'est jamais rencontrée, une qui s'est rencontrée une fois (éligible à
// une revanche, voir allowRematchesFromRound) et une qui s'est déjà
// rencontrée deux fois (revanche déjà consommée, à éviter de nouveau).
function buildMeetingCounts(pairs: { home: string; away: string }[]): Map<string, Map<string, number>> {
  const counts = new Map<string, Map<string, number>>();
  function bump(a: string, b: string) {
    if (!counts.has(a)) counts.set(a, new Map());
    const forA = counts.get(a)!;
    forA.set(b, (forA.get(b) ?? 0) + 1);
  }
  for (const { home, away } of pairs) {
    bump(home, away);
    bump(away, home);
  }
  return counts;
}

// Dérive, à partir du décompte de rencontres, l'ensemble des adversaires à
// éviter pour l'appariement suisse : ceux déjà rencontrés au moins
// `maxAllowedMeetings` fois. maxAllowedMeetings=1 reproduit le
// comportement historique (toute revanche est évitée) ; =2 tolère une
// unique revanche par paire avant de recommencer à l'éviter — voir
// Tournament.allowRematchesFromRound, jamais plus permissif que ça : une
// même paire ne peut donc jamais se rencontrer une 3e fois.
function deriveAvoidSet(
  counts: Map<string, Map<string, number>>,
  maxAllowedMeetings: number
): Map<string, Set<string>> {
  const avoid = new Map<string, Set<string>>();
  for (const [entrant, opponents] of counts) {
    const set = new Set<string>();
    for (const [opponent, count] of opponents) {
      if (count >= maxAllowedMeetings) set.add(opponent);
    }
    avoid.set(entrant, set);
  }
  return avoid;
}

// Étend un ensemble d'adversaires à éviter en y ajoutant, pour chaque
// entrant, tous les autres entrants partageant la même poule d'origine —
// empêche deux joueurs (ou équipes) déjà réunis en poule de se recroiser
// dès la phase suisse d'un tournoi Combiné, tant que les revanches ne sont
// pas autorisées (voir Tournament.allowRematchesFromRound). Une fois les
// revanches autorisées, l'origine de poule redevient sans importance : seul
// le nombre réel de rencontres suisses (voir deriveAvoidSet) compte alors —
// à l'appelant de ne pas appeler cette fonction dans ce cas.
function addSamePoolAvoidance(
  avoidSet: Map<string, Set<string>>,
  poolByEntrant: Map<string, string>
): void {
  for (const [entrantId, poolId] of poolByEntrant) {
    if (!avoidSet.has(entrantId)) avoidSet.set(entrantId, new Set());
    const set = avoidSet.get(entrantId)!;
    for (const [otherId, otherPoolId] of poolByEntrant) {
      if (otherId !== entrantId && otherPoolId === poolId) set.add(otherId);
    }
  }
}

// Construit les appariements du 1er tour de la phase finale de poules.
// - Une seule poule (tous les qualifiés viennent du même classement) :
//   tirage au sort standard (1er-dernier, 4e-5e, 2e-avant-dernier, ...) qui
//   garde les deux premiers du classement dans des moitiés de tableau
//   séparées.
// - Exactement 2 poules de même taille : appariement en croix
//   (1erA-derB, 2eA-avant-dernier B, 1erB-derA, ...), même principe mais
//   entre les deux poules plutôt qu'au sein d'un seul classement.
// - Sinon (plus de 2 poules, ou tailles différentes) : reprend l'ancien
//   comportement, qualifiés intercalés par rang puis appariés dans l'ordre.
function buildPoolFinalPhasePairings<T extends { standings: { playerId?: string; teamId?: string }[] }>(
  pools: T[],
  qualifiersPerPool: number | null,
  idKey: "playerId" | "teamId"
): Pairing[] {
  const poolQualifiers = pools.map((pool) =>
    pool.standings
      .slice(0, qualifiersPerPool ?? pool.standings.length)
      .map((row) => row[idKey])
      .filter((id): id is string => Boolean(id))
  );

  if (poolQualifiers.length === 1) {
    return standardBracketSeeding(poolQualifiers[0]);
  }

  if (
    poolQualifiers.length === 2 &&
    poolQualifiers[0].length > 0 &&
    poolQualifiers[0].length === poolQualifiers[1].length
  ) {
    return crossSeedTwoPools(poolQualifiers[0], poolQualifiers[1]);
  }

  const flatQualifiers = selectPoolQualifiers(pools, qualifiersPerPool, idKey);
  return generateKnockoutFirstRound(flatQualifiers);
}

async function generateFinalPhaseFromPoolsActionImpl(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || tournament.format !== "GROUPS" || tournament.isTeamEvent) {
    throw new Error("Cette action ne s'applique qu'aux tournois individuels en poules.");
  }

  const poolMatches = await prisma.match.findMany({
    where: { round: { tournamentId }, poolId: { not: null } },
  });
  if (poolMatches.length === 0) throw new Error("Générez d'abord les rondes en poules.");
  const unfinished = poolMatches.some(
    (m) => !m.isBye && m.homePlayerId && m.awayPlayerId && m.status === "SCHEDULED"
  );
  if (unfinished) {
    throw new Error("Terminez la phase de poules avant de générer la phase finale.");
  }

  const finalPhaseMatches = await prisma.match.count({
    where: { round: { tournamentId }, poolId: null },
  });
  if (finalPhaseMatches > 0) throw new Error("La phase finale a déjà été générée.");

  const poolStandings = await computeClassicPoolStandings(tournamentId);
  const pairings = buildPoolFinalPhasePairings(poolStandings, tournament.qualifiersPerPool, "playerId");
  if (pairings.length === 0) {
    throw new Error("Pas assez de qualifiés pour générer une phase finale.");
  }

  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
  });
  const round = await prisma.round.create({
    data: {
      tournamentId,
      number: (last?.number ?? 0) + 1,
      ...(tournament.knockoutTwoLegs ? { knockoutLeg: 1, knockoutStage: 1 } : {}),
    },
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
  notifyTournamentUpdate(tournamentId);
}
export const generateFinalPhaseFromPoolsAction = safeRoundAction(generateFinalPhaseFromPoolsActionImpl);

async function generateTeamFinalPhaseFromPoolsActionImpl(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || tournament.format !== "GROUPS" || !tournament.isTeamEvent) {
    throw new Error("Cette action ne s'applique qu'aux tournois par équipes en poules.");
  }

  const poolMatches = await prisma.match.findMany({
    where: { round: { tournamentId }, poolId: { not: null } },
  });
  if (poolMatches.length === 0) throw new Error("Générez d'abord les rondes en poules.");
  const unfinished = poolMatches.some(
    (m) => !m.isBye && m.homePlayerId && m.awayPlayerId && m.status === "SCHEDULED"
  );
  if (unfinished) {
    throw new Error("Terminez la phase de poules avant de générer la phase finale.");
  }

  const finalPhaseMatches = await prisma.match.count({
    where: { round: { tournamentId }, poolId: null },
  });
  if (finalPhaseMatches > 0) throw new Error("La phase finale a déjà été générée.");

  const poolStandings = await computeClassicTeamPoolStandings(tournamentId);
  const qualifierIds = selectPoolQualifiers(poolStandings, tournament.qualifiersPerPool, "teamId");
  if (qualifierIds.length < 2) {
    throw new Error("Pas assez d'équipes qualifiées pour générer une phase finale.");
  }
  const pairings = buildPoolFinalPhasePairings(poolStandings, tournament.qualifiersPerPool, "teamId");

  const teams = await prisma.team.findMany({
    where: { id: { in: qualifierIds } },
    include: { members: { orderBy: { board: "asc" } } },
  });
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const boardCount = teams[0]?.members.length ?? 0;
  if (boardCount === 0) throw new Error("Chaque équipe qualifiée doit avoir au moins un joueur.");

  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
  });
  const round = await prisma.round.create({
    data: { tournamentId, number: (last?.number ?? 0) + 1 },
  });

  const tableCounter = createTableCounter();
  for (const pairing of pairings) {
    const homeTeam = teamsById.get(pairing.home)!;
    const awayTeam = pairing.away ? teamsById.get(pairing.away)! : null;
    await createTeamEncounterMatches(round.id, homeTeam, awayTeam, boardCount, tableCounter);
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
  notifyTournamentUpdate(tournamentId);
}
export const generateTeamFinalPhaseFromPoolsAction = safeRoundAction(generateTeamFinalPhaseFromPoolsActionImpl);

// Génère la ronde suisse suivante d'un tournoi COMBINED (poules puis
// suisse) : la toute première ronde de cette sous-phase (aucun match
// isSwissPhase encore en base) part des qualifiés de poules, fraîchement
// départagés (voir seedFirstSwissRound) — les rondes suivantes reprennent le
// classement de la phase suisse elle-même (voir computeClassicSwissPhaseStandings),
// sans tenir compte des résultats de poules. Une seule action, comme
// generateNextSwissRoundActionImpl unifie déjà "1re ronde" et "ronde
// suivante" pour le format SWISS classique.
async function generateSwissPhaseRoundActionImpl(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || tournament.format !== "COMBINED" || tournament.isTeamEvent) {
    throw new Error("Cette action ne s'applique qu'aux tournois individuels au format Combiné.");
  }

  const previousSwissMatches = await prisma.match.findMany({
    where: { round: { tournamentId, isSwissPhase: true } },
  });
  const unfinished = previousSwissMatches.some(
    (m) => !m.isBye && m.homePlayerId && m.awayPlayerId && m.status === "SCHEDULED"
  );
  if (unfinished) {
    throw new Error("Terminez la saisie des résultats de la ronde en cours avant d'en générer une nouvelle.");
  }

  let standingsForPairing: { playerId: string; matchPoints: number }[];
  if (previousSwissMatches.length === 0) {
    const poolMatches = await prisma.match.findMany({
      where: { round: { tournamentId }, poolId: { not: null } },
    });
    if (poolMatches.length === 0) throw new Error("Générez d'abord les rondes en poules.");
    const poolUnfinished = poolMatches.some(
      (m) => !m.isBye && m.homePlayerId && m.awayPlayerId && m.status === "SCHEDULED"
    );
    if (poolUnfinished) {
      throw new Error("Terminez la phase de poules avant de générer la phase suisse.");
    }

    const poolStandings = await computeClassicPoolStandings(tournamentId);
    const qualifierIds = selectPoolQualifiers(poolStandings, tournament.qualifiersPerPool, "playerId");
    if (qualifierIds.length < 2) {
      throw new Error("Pas assez de qualifiés pour générer une phase suisse.");
    }

    // La phase suisse part du classement général de poules (fusion des
    // poules, voir computeClassicGeneralPoolStandings) plutôt que d'un
    // tirage au sort ou d'un classement Elo (seedFirstSwissRound) : la
    // phase de poules qualifie, mais c'est sa hiérarchie qui amorce le
    // système suisse.
    const generalStandings = await computeClassicGeneralPoolStandings(tournamentId);
    const qualifierSet = new Set(qualifierIds);
    standingsForPairing = generalStandings
      .filter((s) => qualifierSet.has(s.playerId))
      .map((s) => ({ playerId: s.playerId, matchPoints: 0 }));
  } else {
    const standings = await computeClassicSwissPhaseStandings(tournamentId);
    standingsForPairing = standings.map((s) => ({ playerId: s.playerId, matchPoints: s.matchPoints }));
  }

  const playersWithBye = new Set<string>();
  for (const m of previousSwissMatches) {
    if (m.isBye && m.homePlayerId) playersWithBye.add(m.homePlayerId);
  }
  const meetingCounts = buildMeetingCounts(
    previousSwissMatches
      .filter((m): m is typeof m & { homePlayerId: string; awayPlayerId: string } =>
        !m.isBye && m.homePlayerId !== null && m.awayPlayerId !== null
      )
      .map((m) => ({ home: m.homePlayerId, away: m.awayPlayerId }))
  );

  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
  });

  // Voir le commentaire équivalent dans generateNextSwissRoundActionImpl :
  // un joueur forfait à la ronde suisse qui vient de se terminer est envoyé
  // en bas du classement pour l'appariement plutôt que de laisser un joueur
  // présent hériter d'une "victoire gratuite".
  const forfeitedLastRound = new Set<string>();
  if (last && last.isSwissPhase) {
    const lastRoundMatches = previousSwissMatches.filter((m) => m.roundId === last.id);
    for (const m of lastRoundMatches) {
      if (m.status === "FORFEIT_HOME" && m.homePlayerId) forfeitedLastRound.add(m.homePlayerId);
      if (m.status === "FORFEIT_AWAY" && m.awayPlayerId) forfeitedLastRound.add(m.awayPlayerId);
      if (m.status === "FORFEIT_BOTH") {
        if (m.homePlayerId) forfeitedLastRound.add(m.homePlayerId);
        if (m.awayPlayerId) forfeitedLastRound.add(m.awayPlayerId);
      }
    }
  }

  // Contrairement au format SWISS classique, la ronde de ce réglage se
  // compte au sein de la phase suisse elle-même (comme le libellé "Ronde
  // suisse N" affiché ailleurs), pas dans la numérotation globale du
  // tournoi qui inclut les rondes de poules précédentes.
  const swissPhaseRoundsSoFar = await prisma.round.count({
    where: { tournamentId, isSwissPhase: true },
  });
  const upcomingSwissRoundNumber = swissPhaseRoundsSoFar + 1;
  const rematchesAllowed =
    tournament.allowRematchesFromRound !== null &&
    upcomingSwissRoundNumber >= tournament.allowRematchesFromRound;
  const opponentsForPairing = deriveAvoidSet(meetingCounts, rematchesAllowed ? 2 : 1);
  // Tant que les revanches ne sont pas autorisées, deux joueurs déjà réunis
  // dans la même poule ne se recroisent pas en phase suisse — l'origine de
  // poule n'a en revanche plus d'importance une fois les revanches
  // autorisées (voir addSamePoolAvoidance).
  if (!rematchesAllowed) {
    const poolMembers = await prisma.poolMember.findMany({
      where: { pool: { tournamentId } },
      select: { playerId: true, poolId: true },
    });
    addSamePoolAvoidance(opponentsForPairing, new Map(poolMembers.map((m) => [m.playerId, m.poolId])));
  }

  const pairings = generateSwissRoundWithForfeits(
    standingsForPairing,
    opponentsForPairing,
    playersWithBye,
    forfeitedLastRound
  );

  const round = await prisma.round.create({
    data: { tournamentId, number: (last?.number ?? 0) + 1, isFinalPhase: true, isSwissPhase: true },
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
  notifyTournamentUpdate(tournamentId);
}
export const generateSwissPhaseRoundAction = safeRoundAction(generateSwissPhaseRoundActionImpl);

// Équivalent équipes de generateSwissPhaseRoundActionImpl : voir les
// commentaires de cette dernière, la seule différence étant le
// regroupement par confrontation (une équipe, plusieurs échiquiers) plutôt
// qu'un match par joueur.
async function generateTeamSwissPhaseRoundActionImpl(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || tournament.format !== "COMBINED" || !tournament.isTeamEvent) {
    throw new Error("Cette action ne s'applique qu'aux tournois par équipes au format Combiné.");
  }

  const previousSwissMatches = await prisma.match.findMany({
    where: { round: { tournamentId, isSwissPhase: true } },
  });
  const unfinished = previousSwissMatches.some(
    (m) => !m.isBye && m.homePlayerId && m.awayPlayerId && m.status === "SCHEDULED"
  );
  if (unfinished) {
    throw new Error("Terminez la saisie des résultats de la ronde en cours avant d'en générer une nouvelle.");
  }

  let qualifierIds: string[];
  let standingsForPairing: { playerId: string; matchPoints: number }[];
  if (previousSwissMatches.length === 0) {
    const poolMatches = await prisma.match.findMany({
      where: { round: { tournamentId }, poolId: { not: null } },
    });
    if (poolMatches.length === 0) throw new Error("Générez d'abord les rondes en poules.");
    const poolUnfinished = poolMatches.some(
      (m) => !m.isBye && m.homePlayerId && m.awayPlayerId && m.status === "SCHEDULED"
    );
    if (poolUnfinished) {
      throw new Error("Terminez la phase de poules avant de générer la phase suisse.");
    }

    const poolStandings = await computeClassicTeamPoolStandings(tournamentId);
    qualifierIds = selectPoolQualifiers(poolStandings, tournament.qualifiersPerPool, "teamId");
    if (qualifierIds.length < 2) {
      throw new Error("Pas assez d'équipes qualifiées pour générer une phase suisse.");
    }

    // Voir le commentaire équivalent dans generateSwissPhaseRoundActionImpl.
    const generalStandings = await computeClassicTeamGeneralPoolStandings(tournamentId);
    const qualifierSet = new Set(qualifierIds);
    standingsForPairing = generalStandings
      .filter((s) => qualifierSet.has(s.teamId))
      .map((s) => ({ playerId: s.teamId, matchPoints: 0 }));
  } else {
    const standings = await computeClassicTeamSwissPhaseStandings(tournamentId);
    qualifierIds = standings.map((s) => s.teamId);
    standingsForPairing = standings.map((s) => ({ playerId: s.teamId, matchPoints: s.matchPoints }));
  }

  const teams = await prisma.team.findMany({
    where: { id: { in: qualifierIds } },
    include: { members: { orderBy: { board: "asc" } } },
  });
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const boardCount = teams[0]?.members.length ?? 0;
  if (boardCount === 0) throw new Error("Chaque équipe qualifiée doit avoir au moins un joueur.");

  const teamsWithBye = new Set<string>();
  for (const m of previousSwissMatches) {
    if (m.isBye && m.homeTeamId) teamsWithBye.add(m.homeTeamId);
  }
  // Voir le commentaire équivalent dans generateNextTeamSwissRoundActionImpl
  // (déduplication par confrontation, pas par échiquier).
  const encounterKeys = new Set<string>();
  const teamMeetingPairs: { home: string; away: string }[] = [];
  for (const m of previousSwissMatches) {
    if (m.isBye || !m.homeTeamId || !m.awayTeamId) continue;
    const key = `${m.roundId}:${m.homeTeamId}:${m.awayTeamId}`;
    if (encounterKeys.has(key)) continue;
    encounterKeys.add(key);
    teamMeetingPairs.push({ home: m.homeTeamId, away: m.awayTeamId });
  }
  const meetingCounts = buildMeetingCounts(teamMeetingPairs);

  // Voir le commentaire équivalent dans generateSwissPhaseRoundActionImpl.
  const swissPhaseRoundsSoFar = await prisma.round.count({
    where: { tournamentId, isSwissPhase: true },
  });
  const upcomingSwissRoundNumber = swissPhaseRoundsSoFar + 1;
  const rematchesAllowed =
    tournament.allowRematchesFromRound !== null &&
    upcomingSwissRoundNumber >= tournament.allowRematchesFromRound;
  const opponentsForPairing = deriveAvoidSet(meetingCounts, rematchesAllowed ? 2 : 1);
  // Voir le commentaire équivalent dans generateSwissPhaseRoundActionImpl.
  if (!rematchesAllowed) {
    const teamsWithPool = await prisma.team.findMany({
      where: { tournamentId, poolId: { not: null } },
      select: { id: true, poolId: true },
    });
    addSamePoolAvoidance(
      opponentsForPairing,
      new Map(teamsWithPool.map((t) => [t.id, t.poolId as string]))
    );
  }

  const pairings = generateSwissRound(standingsForPairing, opponentsForPairing, teamsWithBye);

  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
  });
  const round = await prisma.round.create({
    data: { tournamentId, number: (last?.number ?? 0) + 1, isFinalPhase: true, isSwissPhase: true },
  });

  for (const pairing of pairings) {
    const homeTeam = teamsById.get(pairing.home)!;

    if (pairing.away === null) {
      await prisma.match.create({
        data: { roundId: round.id, homeTeamId: homeTeam.id, isBye: true, status: "PLAYED" },
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
  notifyTournamentUpdate(tournamentId);
}
export const generateTeamSwissPhaseRoundAction = safeRoundAction(generateTeamSwissPhaseRoundActionImpl);

export async function updateFinalPhaseSettingsAction(
  tournamentId: string,
  formData: FormData
) {
  const tournament = await assertCanManage(tournamentId);
  if (
    tournament.type !== "CLASSIC" ||
    (tournament.format !== "ROUND_ROBIN" &&
      tournament.format !== "SWISS" &&
      tournament.format !== "COMBINED")
  ) {
    throw new Error("La phase finale optionnelle ne s'applique qu'au round-robin, au suisse et au Combiné.");
  }

  const finalPhaseEnabled = formData.get("finalPhaseEnabled") === "on";
  const raw = formData.get("finalPhaseQualifiers");
  const finalPhaseQualifiers = Number(raw);
  if (!Number.isInteger(finalPhaseQualifiers) || finalPhaseQualifiers < 2) return;

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { finalPhaseEnabled, finalPhaseQualifiers },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
}

// Fixe (ou retire) le nombre de rondes suisses que l'organisateur prévoit de
// jouer avant de passer à la phase finale — un champ vide retire la limite
// et redonne un enchaînement de rondes sans fin prédéfinie, comme avant
// l'ajout de ce réglage.
export async function updateSwissRoundsSettingsAction(
  tournamentId: string,
  formData: FormData
) {
  const tournament = await assertCanManage(tournamentId);
  if (
    tournament.type !== "CLASSIC" ||
    (tournament.format !== "SWISS" && tournament.format !== "COMBINED")
  ) {
    throw new Error("Ce réglage ne s'applique qu'au format suisse et au Combiné.");
  }

  const raw = formData.get("swissRoundsCount");
  const swissRoundsCount = raw && String(raw).trim() ? Number(raw) : null;
  if (swissRoundsCount !== null && (!Number.isInteger(swissRoundsCount) || swissRoundsCount < 1)) {
    return;
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { swissRoundsCount },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
}

// Fixe (ou retire) la ronde suisse à partir de laquelle les revanches sont
// volontairement autorisées — voir le commentaire sur Tournament.allowRematchesFromRound.
export async function updateAllowRematchesFromRoundAction(
  tournamentId: string,
  formData: FormData
) {
  const tournament = await assertCanManage(tournamentId);
  if (
    tournament.type !== "CLASSIC" ||
    (tournament.format !== "SWISS" && tournament.format !== "COMBINED")
  ) {
    throw new Error("Ce réglage ne s'applique qu'au format suisse et au Combiné.");
  }

  const raw = formData.get("allowRematchesFromRound");
  const allowRematchesFromRound = raw && String(raw).trim() ? Number(raw) : null;
  if (
    allowRematchesFromRound !== null &&
    (!Number.isInteger(allowRematchesFromRound) || allowRematchesFromRound < 1)
  ) {
    return;
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { allowRematchesFromRound },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
}

// Fixe la méthode d'appariement de la ronde 1 (tirage au sort ou Elo
// classique) — sans effet une fois cette ronde déjà générée, voir
// seedFirstSwissRound.
export async function updateSwissSeedingAction(
  tournamentId: string,
  formData: FormData
) {
  const tournament = await assertCanManage(tournamentId);
  if (
    tournament.type !== "CLASSIC" ||
    (tournament.format !== "SWISS" && tournament.format !== "COMBINED")
  ) {
    throw new Error("Ce réglage ne s'applique qu'au format suisse et au Combiné.");
  }

  const swissSeeding = formData.get("swissSeeding");
  if (swissSeeding !== "RANDOM" && swissSeeding !== "RATING") {
    throw new Error("Méthode invalide.");
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { swissSeeding },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
}

// Active/désactive le match pour la 3e place (perdants de demi-finale) —
// s'applique à tout tableau à élimination directe (KNOCKOUT, phase finale
// de poules, ou phase finale round-robin/suisse), contrairement à la
// phase finale optionnelle ci-dessus qui ne concerne que le round-robin et
// le suisse.
export async function updateThirdPlaceSettingsAction(
  tournamentId: string,
  formData: FormData
) {
  await assertCanManage(tournamentId);
  const thirdPlaceMatchEnabled = formData.get("thirdPlaceMatchEnabled") === "on";

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { thirdPlaceMatchEnabled },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
}

// Active/désactive le format 2 manches + belle pour tout tableau à
// élimination directe individuel (voir Tournament.knockoutTwoLegs) — sans
// effet sur le match pour la 3e place, toujours en un seul match.
export async function updateKnockoutTwoLegsAction(tournamentId: string, formData: FormData) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || tournament.isTeamEvent) {
    throw new Error("Ce réglage ne s'applique qu'aux tournois individuels.");
  }
  const knockoutTwoLegs = formData.get("knockoutTwoLegs") === "on";

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { knockoutTwoLegs },
  });

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
}

// Sélectionne les N premiers du classement général (round-robin ou
// suisse) pour la phase finale à élimination directe optionnelle — pas
// de notion de poule ici, contrairement à selectPoolQualifiers.
async function generateFinalPhaseFromStandingsActionImpl(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (
    tournament.type !== "CLASSIC" ||
    tournament.isTeamEvent ||
    (tournament.format !== "ROUND_ROBIN" &&
      tournament.format !== "SWISS" &&
      tournament.format !== "COMBINED")
  ) {
    throw new Error("Cette action ne s'applique qu'aux tournois individuels en round-robin, suisse ou Combiné.");
  }
  if (!tournament.finalPhaseEnabled) {
    throw new Error("La phase finale n'est pas activée pour ce tournoi.");
  }

  const isCombined = tournament.format === "COMBINED";
  // Pour COMBINED, la "phase principale" à terminer avant la phase finale
  // est la phase suisse (isSwissPhase), pas les poules — celles-ci ont déjà
  // dû être terminées pour pouvoir générer la phase suisse elle-même.
  const mainPhaseMatches = await prisma.match.findMany({
    where: isCombined
      ? { round: { tournamentId, isSwissPhase: true } }
      : { round: { tournamentId, isFinalPhase: false } },
  });
  if (mainPhaseMatches.length === 0) {
    throw new Error(
      isCombined ? "Générez d'abord la phase suisse." : "Générez d'abord les rondes."
    );
  }
  const unfinished = mainPhaseMatches.some(
    (m) => !m.isBye && m.homePlayerId && m.awayPlayerId && m.status === "SCHEDULED"
  );
  if (unfinished) {
    throw new Error("Terminez la saisie des résultats avant de générer la phase finale.");
  }

  // Pour COMBINED, ne compter que les rondes de tableau à élimination
  // directe déjà générées (isSwissPhase: false) — sans quoi les rondes de
  // la phase suisse elle-même (isFinalPhase: true) feraient croire à tort
  // que la phase finale existe déjà.
  const finalPhaseMatches = await prisma.match.count({
    where: {
      round: { tournamentId, isFinalPhase: true, ...(isCombined ? { isSwissPhase: false } : {}) },
    },
  });
  if (finalPhaseMatches > 0) throw new Error("La phase finale a déjà été générée.");

  const standings = isCombined
    ? await computeClassicSwissPhaseStandings(tournamentId)
    : await computeClassicStandings(tournamentId);
  const qualifiers = standings.slice(0, tournament.finalPhaseQualifiers).map((s) => s.playerId);
  if (qualifiers.length < 2) {
    throw new Error("Pas assez de joueurs classés pour générer une phase finale.");
  }

  const pairings = standardBracketSeeding(qualifiers);
  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
  });
  const round = await prisma.round.create({
    data: {
      tournamentId,
      number: (last?.number ?? 0) + 1,
      isFinalPhase: true,
      ...(tournament.knockoutTwoLegs ? { knockoutLeg: 1, knockoutStage: 1 } : {}),
    },
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
  notifyTournamentUpdate(tournamentId);
}
export const generateFinalPhaseFromStandingsAction = safeRoundAction(
  generateFinalPhaseFromStandingsActionImpl
);

async function generateTeamFinalPhaseFromStandingsActionImpl(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (
    tournament.type !== "CLASSIC" ||
    !tournament.isTeamEvent ||
    (tournament.format !== "ROUND_ROBIN" &&
      tournament.format !== "SWISS" &&
      tournament.format !== "COMBINED")
  ) {
    throw new Error("Cette action ne s'applique qu'aux tournois par équipes en round-robin, suisse ou Combiné.");
  }
  if (!tournament.finalPhaseEnabled) {
    throw new Error("La phase finale n'est pas activée pour ce tournoi.");
  }

  const isCombined = tournament.format === "COMBINED";
  // Voir les commentaires équivalents dans generateFinalPhaseFromStandingsActionImpl.
  const mainPhaseMatches = await prisma.match.findMany({
    where: isCombined
      ? { round: { tournamentId, isSwissPhase: true } }
      : { round: { tournamentId, isFinalPhase: false } },
  });
  if (mainPhaseMatches.length === 0) {
    throw new Error(
      isCombined ? "Générez d'abord la phase suisse." : "Générez d'abord les rondes."
    );
  }
  const unfinished = mainPhaseMatches.some(
    (m) => !m.isBye && m.homePlayerId && m.awayPlayerId && m.status === "SCHEDULED"
  );
  if (unfinished) {
    throw new Error("Terminez la saisie des résultats avant de générer la phase finale.");
  }

  const finalPhaseMatches = await prisma.match.count({
    where: {
      round: { tournamentId, isFinalPhase: true, ...(isCombined ? { isSwissPhase: false } : {}) },
    },
  });
  if (finalPhaseMatches > 0) throw new Error("La phase finale a déjà été générée.");

  const teamStandings = isCombined
    ? await computeClassicTeamSwissPhaseStandings(tournamentId)
    : await computeClassicTeamStandings(tournamentId);
  const qualifierIds = teamStandings.slice(0, tournament.finalPhaseQualifiers).map((s) => s.teamId);
  if (qualifierIds.length < 2) {
    throw new Error("Pas assez d'équipes classées pour générer une phase finale.");
  }

  const teams = await prisma.team.findMany({
    where: { id: { in: qualifierIds } },
    include: { members: { orderBy: { board: "asc" } } },
  });
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const boardCount = teams[0]?.members.length ?? 0;
  if (boardCount === 0) throw new Error("Chaque équipe qualifiée doit avoir au moins un joueur.");

  const pairings = standardBracketSeeding(qualifierIds);
  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
  });
  const round = await prisma.round.create({
    data: { tournamentId, number: (last?.number ?? 0) + 1, isFinalPhase: true },
  });

  const tableCounter = createTableCounter();
  for (const pairing of pairings) {
    const homeTeam = teamsById.get(pairing.home)!;
    const awayTeam = pairing.away ? teamsById.get(pairing.away)! : null;
    await createTeamEncounterMatches(round.id, homeTeam, awayTeam, boardCount, tableCounter);
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
  notifyTournamentUpdate(tournamentId);
}
export const generateTeamFinalPhaseFromStandingsAction = safeRoundAction(
  generateTeamFinalPhaseFromStandingsActionImpl
);

async function generateKnockoutBracketActionImpl(tournamentId: string) {
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
  const round = await prisma.round.create({
    data: {
      tournamentId,
      number: 1,
      ...(tournament.knockoutTwoLegs ? { knockoutLeg: 1, knockoutStage: 1 } : {}),
    },
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
  notifyTournamentUpdate(tournamentId);
}
export const generateKnockoutBracketAction = safeRoundAction(generateKnockoutBracketActionImpl);

// Dépouillement d'un tour joué en 2 manches + belle (voir
// Tournament.knockoutTwoLegs) : soit toutes ses confrontations sont
// tranchées (resolved), soit certaines sont à une manche partout et
// attendent une belle qui n'a pas encore été générée (resolved: false, avec
// la liste des confrontations concernées pour la créer).
type TwoLegStageResolution =
  | { resolved: true; winners: string[]; losers: string[] }
  | { resolved: false; splitPairings: { home: string; away: string; homeStarts: boolean }[] };

async function resolveTwoLegStage(
  tournamentId: string,
  knockoutStage: number
): Promise<TwoLegStageResolution> {
  const stageRounds = await prisma.round.findMany({
    where: { tournamentId, knockoutStage },
    include: { matches: true },
    orderBy: { knockoutLeg: "asc" },
  });
  const leg1 = stageRounds.find((r) => r.knockoutLeg === 1);
  const leg2 = stageRounds.find((r) => r.knockoutLeg === 2);
  const belle = stageRounds.find((r) => r.knockoutLeg === 3);
  if (!leg1) throw new Error("Manche aller introuvable pour ce tour.");

  const winners: string[] = [];
  const losers: string[] = [];
  const splitPairings: { home: string; away: string; homeStarts: boolean }[] = [];

  for (const m1 of leg1.matches) {
    const w1 = getKnockoutWinner(m1);
    if (!w1) {
      throw new Error(
        `Le résultat de la table ${m1.table ?? "?"} (manche aller) n'est pas encore tranché.`
      );
    }
    if (m1.isBye || !m1.homePlayerId || !m1.awayPlayerId) {
      winners.push(w1);
      continue;
    }
    if (!leg2) throw new Error("Générez d'abord la manche retour.");
    const m2 = leg2.matches.find(
      (m) => m.homePlayerId === m1.homePlayerId && m.awayPlayerId === m1.awayPlayerId
    );
    if (!m2) throw new Error("Confrontation introuvable en manche retour.");
    const w2 = getKnockoutWinner(m2);
    if (!w2) {
      throw new Error(
        `Le résultat de la table ${m2.table ?? "?"} (manche retour) n'est pas encore tranché.`
      );
    }
    if (w1 === w2) {
      winners.push(w1);
      losers.push(w1 === m1.homePlayerId ? m1.awayPlayerId : m1.homePlayerId);
      continue;
    }
    // Chacun a gagné une manche : cette confrontation attend une belle.
    if (!belle) {
      splitPairings.push({ home: m1.homePlayerId, away: m1.awayPlayerId, homeStarts: m1.homeStarts });
      continue;
    }
    const mb = belle.matches.find(
      (m) => m.homePlayerId === m1.homePlayerId && m.awayPlayerId === m1.awayPlayerId
    );
    if (!mb) throw new Error("Confrontation introuvable en belle.");
    const wb = getKnockoutWinner(mb);
    if (!wb) {
      throw new Error(`Le résultat de la table ${mb.table ?? "?"} (belle) n'est pas encore tranché.`);
    }
    winners.push(wb);
    losers.push(wb === m1.homePlayerId ? m1.awayPlayerId : m1.homePlayerId);
  }

  if (splitPairings.length > 0) {
    return { resolved: false, splitPairings };
  }
  return { resolved: true, winners, losers };
}

async function generateNextKnockoutRoundActionImpl(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || tournament.isTeamEvent) {
    throw new Error("Ce tournoi n'est pas au format élimination directe.");
  }
  const allowedFormats = ["KNOCKOUT", "GROUPS", "ROUND_ROBIN", "SWISS", "COMBINED"];
  if (!allowedFormats.includes(tournament.format ?? "")) {
    throw new Error("Ce tournoi n'est pas au format élimination directe.");
  }

  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
    include: { matches: true },
  });
  if (!last) throw new Error("Générez d'abord le tableau initial.");
  if (tournament.format === "GROUPS" && last.matches.some((m) => m.poolId)) {
    throw new Error("Générez d'abord la phase finale à partir des qualifiés de poules.");
  }
  if (
    (tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") &&
    !last.isFinalPhase
  ) {
    throw new Error("Générez d'abord la phase finale à partir du classement général.");
  }
  // COMBINED : le tableau à élimination directe n'a pas encore commencé
  // tant que la dernière ronde est une ronde de poule (poolId) ou de phase
  // suisse (isSwissPhase) — voir generateFinalPhaseFromStandingsActionImpl.
  if (
    tournament.format === "COMBINED" &&
    (last.matches.some((m) => m.poolId) || last.isSwissPhase)
  ) {
    throw new Error("Générez d'abord la phase finale à partir du classement de la phase suisse.");
  }

  // Format 2 manches + belle (voir Tournament.knockoutTwoLegs) : après la
  // manche aller (knockoutLeg === 1), on ne connaît pas encore les
  // vainqueurs du tour — on génère simplement sa manche retour (mêmes
  // confrontations, joueur qui débute inversé, voir Match.homeStarts).
  // Sans effet si ce tour n'avait que des exempts (rien à rejouer).
  const hasRealPairing = last.matches.some((m) => !m.isBye);
  if (tournament.knockoutTwoLegs && last.knockoutLeg === 1 && hasRealPairing) {
    for (const m of last.matches) {
      if (m.isBye) continue;
      if (!getKnockoutWinner(m)) {
        throw new Error(
          `Le résultat de la table ${m.table ?? "?"} n'est pas encore tranché (terminez la saisie ou résolvez l'égalité avant de continuer).`
        );
      }
    }
    const round = await prisma.round.create({
      data: {
        tournamentId,
        number: last.number + 1,
        isFinalPhase: last.isFinalPhase,
        knockoutLeg: 2,
        knockoutStage: last.knockoutStage,
      },
    });
    let legTable = 1;
    for (const m of last.matches) {
      if (m.isBye) continue;
      await prisma.match.create({
        data: {
          roundId: round.id,
          table: legTable++,
          homePlayerId: m.homePlayerId,
          awayPlayerId: m.awayPlayerId,
          status: "SCHEDULED",
          homeStarts: !m.homeStarts,
        },
      });
    }
    revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
    notifyTournamentUpdate(tournamentId);
    return;
  }

  let winners: string[];
  // Perdants de ce tour (hors byes, qui n'opposent jamais deux joueurs) —
  // utilisés uniquement pour générer le match de la 3e place quand ce tour
  // s'avère être les demi-finales (winners.length === 2 ci-dessous).
  let losers: string[];

  if (
    tournament.knockoutTwoLegs &&
    (last.knockoutLeg === 2 || last.knockoutLeg === 3) &&
    last.knockoutStage
  ) {
    const resolution = await resolveTwoLegStage(tournamentId, last.knockoutStage);
    if (!resolution.resolved) {
      const round = await prisma.round.create({
        data: {
          tournamentId,
          number: last.number + 1,
          isFinalPhase: last.isFinalPhase,
          knockoutLeg: 3,
          knockoutStage: last.knockoutStage,
        },
      });
      let belleTable = 1;
      for (const pairing of resolution.splitPairings) {
        await prisma.match.create({
          data: {
            roundId: round.id,
            table: belleTable++,
            homePlayerId: pairing.home,
            awayPlayerId: pairing.away,
            status: "SCHEDULED",
            // La belle reprend le joueur qui débutait la manche aller.
            homeStarts: pairing.homeStarts,
          },
        });
      }
      revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
      notifyTournamentUpdate(tournamentId);
      return;
    }
    winners = resolution.winners;
    losers = resolution.losers;
  } else {
    winners = [];
    losers = [];
    for (const match of last.matches) {
      const winner = getKnockoutWinner(match);
      if (!winner) {
        throw new Error(
          `Le résultat de la table ${match.table ?? "?"} n'est pas encore tranché (terminez la saisie ou résolvez l'égalité avant de continuer).`
        );
      }
      winners.push(winner);
      if (!match.isBye && match.homePlayerId && match.awayPlayerId) {
        losers.push(winner === match.homePlayerId ? match.awayPlayerId : match.homePlayerId);
      }
    }
  }

  if (winners.length === 1) {
    throw new Error("Le tournoi est terminé : la finale a déjà été jouée.");
  }

  // Cas particulier des quarts vers les demi-finales quand la phase finale
  // vient d'exactement 2 poules (tirage en croix, voir crossSeedTwoPools) :
  // regrouper les vainqueurs consécutifs (QF1+QF2, QF3+QF4) ferait se
  // rencontrer les deux têtes de poule d'une même poule (1erA-2eA) en
  // demi-finale. On regroupe donc QF1+QF4 et QF2+QF3, qui garantit que les
  // deux poules ne peuvent se recroiser qu'en finale.
  const poolCount =
    tournament.format === "GROUPS" ? await prisma.pool.count({ where: { tournamentId } }) : 0;
  const orderedWinners =
    poolCount === 2 && winners.length === 4
      ? [winners[0], winners[3], winners[1], winners[2]]
      : winners;

  const pairings = pairKnockoutWinners(orderedWinners);
  const round = await prisma.round.create({
    data: {
      tournamentId,
      number: last.number + 1,
      isFinalPhase: last.isFinalPhase,
      ...(tournament.knockoutTwoLegs
        ? { knockoutLeg: 1, knockoutStage: (last.knockoutStage ?? 0) + 1 }
        : {}),
    },
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

  // Match pour la 3e place, optionnel : ce tour n'est généré que si celui
  // qu'on vient de terminer était bien les demi-finales (2 vainqueurs, donc
  // 2 perdants) — jamais après un tour à byes qui ne laisserait qu'un ou
  // zéro perdant réel. Toujours en un seul match, même si le reste du
  // tableau est en 2 manches + belle (voir Tournament.knockoutTwoLegs).
  if (winners.length === 2 && tournament.thirdPlaceMatchEnabled && losers.length === 2) {
    await prisma.match.create({
      data: {
        roundId: round.id,
        table: table++,
        homePlayerId: losers[0],
        awayPlayerId: losers[1],
        status: "SCHEDULED",
        isThirdPlace: true,
      },
    });
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
  notifyTournamentUpdate(tournamentId);
}
export const generateNextKnockoutRoundAction = safeRoundAction(generateNextKnockoutRoundActionImpl);

async function generateTeamKnockoutBracketActionImpl(tournamentId: string) {
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

  const tableCounter = createTableCounter();
  for (const pairing of pairings) {
    const homeTeam = teamsById.get(pairing.home)!;
    const awayTeam = pairing.away ? teamsById.get(pairing.away)! : null;
    await createTeamEncounterMatches(round.id, homeTeam, awayTeam, boardCount, tableCounter);
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
  notifyTournamentUpdate(tournamentId);
}
export const generateTeamKnockoutBracketAction = safeRoundAction(generateTeamKnockoutBracketActionImpl);

async function generateNextTeamKnockoutRoundActionImpl(tournamentId: string) {
  const tournament = await assertCanManage(tournamentId);
  if (tournament.type !== "CLASSIC" || !tournament.isTeamEvent) {
    throw new Error("Ce tournoi n'est pas une élimination directe par équipes.");
  }
  const allowedFormats = ["KNOCKOUT", "GROUPS", "ROUND_ROBIN", "SWISS", "COMBINED"];
  if (!allowedFormats.includes(tournament.format ?? "")) {
    throw new Error("Ce tournoi n'est pas une élimination directe par équipes.");
  }

  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
    include: { matches: true },
  });
  if (!last) throw new Error("Générez d'abord le tableau initial.");
  if (tournament.format === "GROUPS" && last.matches.some((m) => m.poolId)) {
    throw new Error("Générez d'abord la phase finale à partir des qualifiés de poules.");
  }
  if (
    (tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") &&
    !last.isFinalPhase
  ) {
    throw new Error("Générez d'abord la phase finale à partir du classement général.");
  }
  // Voir le commentaire équivalent dans generateNextKnockoutRoundActionImpl.
  if (
    tournament.format === "COMBINED" &&
    (last.matches.some((m) => m.poolId) || last.isSwissPhase)
  ) {
    throw new Error("Générez d'abord la phase finale à partir du classement de la phase suisse.");
  }

  // Regroupe les échiquiers du dernier tour par confrontation (paire
  // d'équipes) pour déterminer le vainqueur de chacune à la majorité
  // d'échiquiers gagnés, dans l'ordre où les confrontations apparaissent.
  const winners: string[] = [];
  // Perdants de ce tour (hors byes) — voir le commentaire équivalent côté
  // individuel, utilisés uniquement pour la 3e place si ce tour s'avère
  // être les demi-finales.
  const losers: string[] = [];
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
    losers.push(homeBoardsWon > awayBoardsWon ? match.awayTeamId : match.homeTeamId);
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

  // Voir le commentaire équivalent côté individuel : on regroupe QF1+QF4 et
  // QF2+QF3 (au lieu de QF1+QF2 et QF3+QF4) pour la transition quarts vers
  // demi-finales d'une phase finale issue d'exactement 2 poules.
  const poolCount =
    tournament.format === "GROUPS" ? await prisma.pool.count({ where: { tournamentId } }) : 0;
  const orderedWinners =
    poolCount === 2 && winners.length === 4
      ? [winners[0], winners[3], winners[1], winners[2]]
      : winners;

  const pairings = pairKnockoutWinners(orderedWinners);
  const round = await prisma.round.create({
    data: { tournamentId, number: last.number + 1, isFinalPhase: last.isFinalPhase },
  });

  const tableCounter = createTableCounter();
  for (const pairing of pairings) {
    const homeTeam = teamsById.get(pairing.home)!;
    const awayTeam = pairing.away ? teamsById.get(pairing.away)! : null;
    await createTeamEncounterMatches(round.id, homeTeam, awayTeam, boardCount, tableCounter);
  }

  // Match pour la 3e place, optionnel : voir le commentaire équivalent côté
  // individuel — uniquement si ce tour est bien les demi-finales (2
  // vainqueurs et donc 2 perdants réels, aucun bye). Numérotation de table
  // qui continue celle du tableau principal plutôt que de repartir de 1.
  if (winners.length === 2 && tournament.thirdPlaceMatchEnabled && losers.length === 2) {
    const loserHomeTeam = teamsById.get(losers[0])!;
    const loserAwayTeam = teamsById.get(losers[1])!;
    await createTeamEncounterMatches(round.id, loserHomeTeam, loserAwayTeam, boardCount, tableCounter, undefined, true);
  }

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
  notifyTournamentUpdate(tournamentId);
}
export const generateNextTeamKnockoutRoundAction = safeRoundAction(
  generateNextTeamKnockoutRoundActionImpl
);

async function addManualRoundActionImpl(tournamentId: string) {
  await assertCanManage(tournamentId);
  const last = await prisma.round.findFirst({
    where: { tournamentId },
    orderBy: { number: "desc" },
  });
  await prisma.round.create({
    data: { tournamentId, number: (last?.number ?? 0) + 1 },
  });
  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
  notifyTournamentUpdate(tournamentId);
}
export const addManualRoundAction = safeRoundAction(addManualRoundActionImpl);

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
  notifyTournamentUpdate(tournamentId);
}

const resultSchema = z.object({
  homeScore: z.string().optional(),
  awayScore: z.string().optional(),
  status: z.enum([
    "SCHEDULED",
    "PLAYED",
    "FORFEIT_HOME",
    "FORFEIT_AWAY",
    "FORFEIT_BOTH",
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

  const homeScore = parsed.data.homeScore ? Number(parsed.data.homeScore) : null;
  const awayScore = parsed.data.awayScore ? Number(parsed.data.awayScore) : null;

  // Si les deux scores sont renseignés mais que le statut est resté sur "À
  // jouer" (valeur par défaut du menu déroulant, facilement oubliée quand
  // on ne fait que saisir un score), on considère le match joué plutôt que
  // d'exiger une action séparée sur le menu — sans quoi le score se
  // sauvegarde silencieusement mais le statut ne bouge pas, ce qui donne
  // l'impression que le bouton OK n'a rien fait. Un score de 0 signale en
  // plus un forfait de ce camp (au Scrabble classique, un score de 0 à
  // l'issue d'une partie réellement jouée est en pratique impossible), ou
  // des deux camps si les deux scores sont à 0 (ex. deux forfaits appariés
  // ensemble par le système suisse, voir generateSwissRoundWithForfeits) —
  // ignoré si l'arbitre a déjà choisi explicitement un statut.
  let status = parsed.data.status;
  if (status === "SCHEDULED" && homeScore !== null && awayScore !== null) {
    if (homeScore === 0 && awayScore === 0) status = "FORFEIT_BOTH";
    else if (homeScore === 0 && awayScore > 0) status = "FORFEIT_HOME";
    else if (awayScore === 0 && homeScore > 0) status = "FORFEIT_AWAY";
    else status = "PLAYED";
  }

  const match = await prisma.match.update({
    where: { id: matchId },
    data: { homeScore, awayScore, status },
  });
  await maybeAdvanceRoundRobin(tournamentId, match.roundId);

  revalidatePath(`/admin/tournois/${tournamentId}/rondes`);
  notifyTournamentUpdate(tournamentId);
  revalidatePath(`/tournois`);
}

