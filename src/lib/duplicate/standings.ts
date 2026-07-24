import { prisma } from "@/lib/prisma";

export interface DuplicateStandingRow {
  playerId: string;
  firstName: string;
  lastName: string;
  gamesPlayed: number;
  totalScore: number;
  totalPenalty: number;
  net: number;
}

export async function computeDuplicateStandings(
  tournamentId: string
): Promise<DuplicateStandingRow[]> {
  const [registrations, results] = await Promise.all([
    prisma.registration.findMany({
      where: { tournamentId },
      include: { player: true },
    }),
    prisma.duplicateResult.findMany({
      where: { game: { tournamentId } },
    }),
  ]);

  const rows = new Map<string, DuplicateStandingRow>();
  for (const reg of registrations) {
    rows.set(reg.playerId, {
      playerId: reg.playerId,
      firstName: reg.player.firstName,
      lastName: reg.player.lastName,
      gamesPlayed: 0,
      totalScore: 0,
      totalPenalty: 0,
      net: 0,
    });
  }

  for (const result of results) {
    let row = rows.get(result.playerId);
    if (!row) {
      row = {
        playerId: result.playerId,
        firstName: "?",
        lastName: "",
        gamesPlayed: 0,
        totalScore: 0,
        totalPenalty: 0,
        net: 0,
      };
      rows.set(result.playerId, row);
    }
    row.gamesPlayed += 1;
    row.totalScore += result.score;
    row.totalPenalty += result.penalty;
    row.net += result.score - result.penalty;
  }

  return [...rows.values()].sort((a, b) => b.net - a.net);
}
