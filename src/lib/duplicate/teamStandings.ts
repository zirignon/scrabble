import { prisma } from "@/lib/prisma";

export interface DuplicateTeamStandingRow {
  teamId: string;
  name: string;
  gamesPlayed: number;
  totalScore: number;
  totalPenalty: number;
  net: number;
}

// Le classement par équipes en duplicate cumule simplement les scores nets
// des membres de chaque équipe sur l'ensemble des parties : pas d'échiquier,
// pas de confrontation directe, juste une addition des résultats individuels.
export async function computeDuplicateTeamStandings(
  tournamentId: string
): Promise<DuplicateTeamStandingRow[]> {
  const teams = await prisma.team.findMany({
    where: { tournamentId },
    include: { members: true },
  });
  const results = await prisma.duplicateResult.findMany({
    where: { game: { tournamentId } },
  });

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
    });
  }

  const gamesByTeam = new Map<string, Set<string>>();
  for (const result of results) {
    const teamId = playerToTeam.get(result.playerId);
    if (!teamId) continue;
    const row = rows.get(teamId)!;
    row.totalScore += result.score;
    row.totalPenalty += result.penalty;
    row.net += result.score - result.penalty;
    if (!gamesByTeam.has(teamId)) gamesByTeam.set(teamId, new Set());
    gamesByTeam.get(teamId)!.add(result.gameId);
  }
  for (const [teamId, gameIds] of gamesByTeam) {
    rows.get(teamId)!.gamesPlayed = gameIds.size;
  }

  return [...rows.values()].sort((a, b) => b.net - a.net);
}
