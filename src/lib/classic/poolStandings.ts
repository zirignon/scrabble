import { prisma } from "@/lib/prisma";
import { computeStandingsFromMatches, expandTeamByeMatches, type ClassicStandingRow } from "@/lib/classic/standings";

export interface PoolStandings {
  poolId: string;
  poolName: string;
  standings: ClassicStandingRow[];
}

// Les joueurs d'une poule viennent de 2 sources mutuellement exclusives
// selon le type de tournoi : PoolMember (tournoi individuel, voir
// addPoolMemberAction) ou, en tournoi par équipes, les membres des équipes
// rattachées à la poule (voir assignTeamToPoolAction — aucun PoolMember
// n'est jamais créé dans ce cas). Sert au calcul du classement INDIVIDUEL
// d'une poule, y compris en tournoi par équipes (performance personnelle de
// chaque joueur sur ses échiquiers, distincte du classement par équipes).
function poolIndividualPlayers(pool: {
  members: { playerId: string; player: { firstName: string; lastName: string } }[];
  teams: { members: { playerId: string; player: { firstName: string; lastName: string } }[] }[];
}) {
  return [
    ...pool.members.map((m) => ({
      playerId: m.playerId,
      firstName: m.player.firstName,
      lastName: m.player.lastName,
    })),
    ...pool.teams.flatMap((t) =>
      t.members.map((m) => ({
        playerId: m.playerId,
        firstName: m.player.firstName,
        lastName: m.player.lastName,
      }))
    ),
  ];
}

// Pour expandTeamByeMatches (voir son commentaire) : un exempt d'équipe
// (homeTeamId renseigné, homePlayerId/awayPlayerId null) doit être crédité
// individuellement à chaque joueur de l'équipe exemptée, sans quoi ses
// joueurs se retrouvent avec un "joué" de moins que les autres au même
// point du tournoi.
function teamMemberIdsById(teams: { id: string; members: { playerId: string }[] }[]) {
  return new Map(teams.map((t) => [t.id, t.members.map((m) => m.playerId)]));
}

// Classement par poule : chaque poule joue son propre round-robin interne,
// donc son classement (points de match, départages) ne doit tenir compte
// que des matchs internes à la poule. Réutilise le même calcul que le
// classement individuel classique, juste appliqué à un sous-ensemble de
// joueurs et de matchs.
export async function computeClassicPoolStandings(
  tournamentId: string,
  uptoRoundNumber?: number
): Promise<PoolStandings[]> {
  const pools = await prisma.pool.findMany({
    where: { tournamentId },
    orderBy: { createdAt: "asc" },
    include: {
      members: { include: { player: true } },
      teams: { include: { members: { include: { player: true } } } },
      matches: { include: { round: true } },
    },
  });

  return pools.map((pool) => ({
    poolId: pool.id,
    poolName: pool.name,
    standings: computeStandingsFromMatches(
      poolIndividualPlayers(pool),
      expandTeamByeMatches(
        pool.matches.map((m) => ({ ...m, roundNumber: m.round.number })),
        teamMemberIdsById(pool.teams)
      ),
      uptoRoundNumber
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
  tournamentId: string,
  uptoRoundNumber?: number
): Promise<ClassicStandingRow[]> {
  const pools = await prisma.pool.findMany({
    where: { tournamentId },
    orderBy: { createdAt: "asc" },
    include: {
      members: { include: { player: true } },
      teams: { include: { members: { include: { player: true } } } },
      matches: { include: { round: true } },
    },
  });

  const teamMemberIdsByTeamId = teamMemberIdsById(pools.flatMap((pool) => pool.teams));
  return computeStandingsFromMatches(
    pools.flatMap((pool) => poolIndividualPlayers(pool)),
    expandTeamByeMatches(
      pools.flatMap((pool) => pool.matches.map((m) => ({ ...m, roundNumber: m.round.number }))),
      teamMemberIdsByTeamId
    ),
    uptoRoundNumber
  );
}

// Sélectionne, pour chaque poule, ses N premiers qualifiés (N =
// tournament.qualifiersPerPool), en intercalant les rangs entre poules
// (tous les 1ers, puis tous les 2èmes...) plutôt qu'en les mettant bout à
// bout, pour limiter les rencontres entre équipes/joueurs de la même
// poule dès le premier tour de la phase finale. qualifiersPerPool à null
// (qualification non activée, par défaut) : tous les membres de chaque
// poule qualifient, jusqu'au rang de la plus grande poule.
export function selectPoolQualifiers<T extends { standings: { playerId?: string; teamId?: string }[] }>(
  pools: T[],
  qualifiersPerPool: number | null,
  idKey: "playerId" | "teamId"
): string[] {
  const maxRank = qualifiersPerPool ?? Math.max(0, ...pools.map((pool) => pool.standings.length));
  const qualifiers: string[] = [];
  for (let rank = 0; rank < maxRank; rank++) {
    for (const pool of pools) {
      const row = pool.standings[rank];
      const id = row?.[idKey];
      if (id) qualifiers.push(id);
    }
  }
  return qualifiers;
}
