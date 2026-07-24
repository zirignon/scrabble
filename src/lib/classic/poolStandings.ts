import { prisma } from "@/lib/prisma";
import { computeStandingsFromMatches, type ClassicStandingRow } from "@/lib/classic/standings";

export interface PoolStandings {
  poolId: string;
  poolName: string;
  standings: ClassicStandingRow[];
}

// Classement par poule : chaque poule joue son propre round-robin interne,
// donc son classement (points de match, départages) ne doit tenir compte
// que des matchs internes à la poule. Réutilise le même calcul que le
// classement individuel classique, juste appliqué à un sous-ensemble de
// joueurs et de matchs.
export async function computeClassicPoolStandings(
  tournamentId: string
): Promise<PoolStandings[]> {
  const pools = await prisma.pool.findMany({
    where: { tournamentId },
    orderBy: { createdAt: "asc" },
    include: {
      members: { include: { player: true } },
      matches: { include: { round: true } },
    },
  });

  return pools.map((pool) => ({
    poolId: pool.id,
    poolName: pool.name,
    standings: computeStandingsFromMatches(
      pool.members.map((m) => ({
        playerId: m.playerId,
        firstName: m.player.firstName,
        lastName: m.player.lastName,
      })),
      pool.matches.map((m) => ({ ...m, roundNumber: m.round.number }))
    ),
  }));
}
