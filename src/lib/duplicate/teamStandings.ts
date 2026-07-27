import { prisma } from "@/lib/prisma";
import { computeGameTop } from "@/lib/duplicate/board";

export interface DuplicateTeamStandingRow {
  teamId: string;
  name: string;
  gamesPlayed: number;
  totalScore: number;
  totalPenalty: number;
  net: number;
  totalTop: number;
  negatif: number | null;
  pourcentage: number | null;
}

// Classement par équipes en duplicate : chaque partie a un "top" (meilleur
// score de référence). Le négatif d'un joueur pour une partie est
// score net − top (toujours ≤ 0) ; le négatif d'une équipe pour une partie
// est la somme des négatifs de ses membres, cumulé sur tout le tournoi.
// Le pourcentage rapporte le cumul des scores de l'équipe au cumul des
// tops de référence de ses membres (score / top × 100). Ces deux valeurs
// ne sont calculées que sur les parties dont le top a été renseigné ;
// le classement trie par pourcentage décroissant (à égalité, le score
// net cumulé départage).
export async function computeDuplicateTeamStandings(
  tournamentId: string
): Promise<DuplicateTeamStandingRow[]> {
  const teams = await prisma.team.findMany({
    where: { tournamentId },
    include: { members: true },
  });
  const results = await prisma.duplicateResult.findMany({
    where: { game: { tournamentId } },
    include: { game: { include: { referenceMoves: { select: { points: true } } } } },
  });
  const topByGame = new Map<string, number | null>();
  function gameTop(game: { id: string; top: number | null; referenceMoves: { points: number }[] }) {
    if (!topByGame.has(game.id)) {
      topByGame.set(game.id, computeGameTop(game.referenceMoves, game.top));
    }
    return topByGame.get(game.id) ?? null;
  }

  const playerToTeam = new Map<string, string>();
  for (const team of teams) {
    for (const member of team.members) playerToTeam.set(member.playerId, team.id);
  }

  const rows = new Map<string, DuplicateTeamStandingRow>();
  for (const team of teams) {
    rows.set(team.id, {
      teamId: team.id,
      name: team.name,
      gamesPlayed: 0,
      totalScore: 0,
      totalPenalty: 0,
      net: 0,
      totalTop: 0,
      negatif: null,
      pourcentage: null,
    });
  }

  const gamesByTeam = new Map<string, Set<string>>();
  const hasTopByTeam = new Set<string>();
  for (const result of results) {
    const teamId = playerToTeam.get(result.playerId);
    if (!teamId) continue;
    const row = rows.get(teamId)!;
    const net = result.score - result.penalty;
    row.totalScore += result.score;
    row.totalPenalty += result.penalty;
    row.net += net;
    const top = gameTop(result.game);
    if (top != null) {
      row.totalTop += top;
      hasTopByTeam.add(teamId);
    }
    if (!gamesByTeam.has(teamId)) gamesByTeam.set(teamId, new Set());
    gamesByTeam.get(teamId)!.add(result.gameId);
  }
  for (const [teamId, gameIds] of gamesByTeam) {
    rows.get(teamId)!.gamesPlayed = gameIds.size;
  }
  for (const teamId of hasTopByTeam) {
    const row = rows.get(teamId)!;
    row.negatif = row.net - row.totalTop;
    row.pourcentage = row.totalTop > 0 ? (row.net / row.totalTop) * 100 : null;
  }

  return [...rows.values()].sort((a, b) => {
    if (a.pourcentage != null && b.pourcentage != null && b.pourcentage !== a.pourcentage) {
      return b.pourcentage - a.pourcentage;
    }
    if (a.pourcentage == null && b.pourcentage != null) return 1;
    if (a.pourcentage != null && b.pourcentage == null) return -1;
    return b.net - a.net;
  });
}
