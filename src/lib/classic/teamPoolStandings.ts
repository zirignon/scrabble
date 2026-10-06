import { prisma } from "@/lib/prisma";
import {
  computeTeamStandingsFromMatches,
  type ClassicTeamStandingRow,
} from "@/lib/classic/teamStandings";

export interface TeamPoolStandings {
  poolId: string;
  poolName: string;
  standings: ClassicTeamStandingRow[];
}

// Classement par poule d'équipes : chaque poule joue son propre round-robin
// interne entre ses équipes, donc son classement ne doit tenir compte que
// des confrontations internes à la poule.
export async function computeClassicTeamPoolStandings(
  tournamentId: string,
  uptoRoundNumber?: number
): Promise<TeamPoolStandings[]> {
  const pools = await prisma.pool.findMany({
    where: { tournamentId },
    orderBy: { createdAt: "asc" },
    include: {
      teams: true,
      matches: { include: { round: { select: { number: true } } } },
    },
  });

  return pools.map((pool) => ({
    poolId: pool.id,
    poolName: pool.name,
    standings: computeTeamStandingsFromMatches(
      pool.teams.map((t) => ({ teamId: t.id, name: t.name })),
      pool.matches.map((m) => ({ ...m, roundNumber: m.round.number })),
      uptoRoundNumber
    ),
  }));
}

// Voir le commentaire équivalent dans poolStandings.ts (computeClassicGeneralPoolStandings).
export async function computeClassicTeamGeneralPoolStandings(
  tournamentId: string,
  uptoRoundNumber?: number
): Promise<ClassicTeamStandingRow[]> {
  const pools = await prisma.pool.findMany({
    where: { tournamentId },
    orderBy: { createdAt: "asc" },
    include: {
      teams: true,
      matches: { include: { round: { select: { number: true } } } },
    },
  });

  return computeTeamStandingsFromMatches(
    pools.flatMap((pool) => pool.teams.map((t) => ({ teamId: t.id, name: t.name }))),
    pools.flatMap((pool) => pool.matches.map((m) => ({ ...m, roundNumber: m.round.number }))),
    uptoRoundNumber
  );
}
