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

// Classement général obtenu en fusionnant les classements de toutes les
// poules en un seul classement trié selon les mêmes critères de départage
// (la confrontation directe ne pouvant naturellement départager que des
// joueurs d'une même poule, puisqu'ils ne se sont jamais affrontés
// autrement). Sert de point de départ à la phase suisse d'un tournoi
// Combiné (voir generateSwissPhaseRoundActionImpl et
// computeClassicSwissPhaseStandings) : la phase de poules qualifie, mais
// c'est ce classement général qui détermine le point de départ du système
// suisse plutôt qu'un tirage au sort ou un classement Elo.
export async function computeClassicGeneralPoolStandings(
  tournamentId: string
): Promise<ClassicStandingRow[]> {
  const pools = await prisma.pool.findMany({
    where: { tournamentId },
    include: {
      members: { include: { player: true } },
      matches: { include: { round: true } },
    },
  });

  return computeStandingsFromMatches(
    pools.flatMap((pool) =>
      pool.members.map((m) => ({
        playerId: m.playerId,
        firstName: m.player.firstName,
        lastName: m.player.lastName,
      }))
    ),
    pools.flatMap((pool) => pool.matches.map((m) => ({ ...m, roundNumber: m.round.number })))
  );
}
