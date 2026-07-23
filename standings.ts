import { prisma } from "@/lib/prisma";

export interface ClassicStandingRow {
  playerId: string;
  firstName: string;
  lastName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  matchPoints: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  buchholz: number;
  buchholzTruncated: number;
  sonnebornBerger: number;
}

type Outcome = "WIN" | "DRAW" | "LOSS";

export async function computeClassicStandings(
  tournamentId: string
): Promise<ClassicStandingRow[]> {
  const [registrations, matches] = await Promise.all([
    prisma.registration.findMany({
      where: { tournamentId },
      include: { player: true },
    }),
    prisma.match.findMany({
      where: { round: { tournamentId } },
    }),
  ]);

  const rows = new Map<string, ClassicStandingRow>();
  function ensure(playerId: string) {
    if (!rows.has(playerId)) {
      rows.set(playerId, {
        playerId,
        firstName: "?",
        lastName: "",
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        matchPoints: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        diff: 0,
        buchholz: 0,
        buchholzTruncated: 0,
        sonnebornBerger: 0,
      });
    }
    return rows.get(playerId)!;
  }

  for (const reg of registrations) {
    const row = ensure(reg.playerId);
    row.firstName = reg.player.firstName;
    row.lastName = reg.player.lastName;
  }

  // Enregistre chaque confrontation joueur/adversaire pour calculer les
  // départages (Buchholz, Sonneborn-Berger) une fois les scores finaux connus.
  const matchups: Array<{ playerId: string; opponentId: string; outcome: Outcome }> = [];

  function applyResult(
    playerId: string,
    opponentId: string,
    outcome: Outcome,
    pointsFor: number,
    pointsAgainst: number
  ) {
    const row = ensure(playerId);
    row.played += 1;
    row.pointsFor += pointsFor;
    row.pointsAgainst += pointsAgainst;
    row.diff += pointsFor - pointsAgainst;
    if (outcome === "WIN") {
      row.wins += 1;
      row.matchPoints += 2;
    } else if (outcome === "DRAW") {
      row.draws += 1;
      row.matchPoints += 1;
    } else {
      row.losses += 1;
    }
    matchups.push({ playerId, opponentId, outcome });
  }

  for (const match of matches) {
    if (match.isBye) {
      if (match.homePlayerId) {
        const row = ensure(match.homePlayerId);
        row.played += 1;
        row.wins += 1;
        row.matchPoints += 2;
      }
      continue;
    }
    if (!match.homePlayerId || !match.awayPlayerId) continue;

    if (match.status === "PLAYED" && match.homeScore != null && match.awayScore != null) {
      if (match.homeScore > match.awayScore) {
        applyResult(match.homePlayerId, match.awayPlayerId, "WIN", match.homeScore, match.awayScore);
        applyResult(match.awayPlayerId, match.homePlayerId, "LOSS", match.awayScore, match.homeScore);
      } else if (match.homeScore < match.awayScore) {
        applyResult(match.homePlayerId, match.awayPlayerId, "LOSS", match.homeScore, match.awayScore);
        applyResult(match.awayPlayerId, match.homePlayerId, "WIN", match.awayScore, match.homeScore);
      } else {
        applyResult(match.homePlayerId, match.awayPlayerId, "DRAW", match.homeScore, match.awayScore);
        applyResult(match.awayPlayerId, match.homePlayerId, "DRAW", match.awayScore, match.homeScore);
      }
    } else if (match.status === "FORFEIT_HOME") {
      applyResult(match.homePlayerId, match.awayPlayerId, "LOSS", match.homeScore ?? 0, match.awayScore ?? 0);
      applyResult(match.awayPlayerId, match.homePlayerId, "WIN", match.awayScore ?? 0, match.homeScore ?? 0);
    } else if (match.status === "FORFEIT_AWAY") {
      applyResult(match.homePlayerId, match.awayPlayerId, "WIN", match.homeScore ?? 0, match.awayScore ?? 0);
      applyResult(match.awayPlayerId, match.homePlayerId, "LOSS", match.awayScore ?? 0, match.homeScore ?? 0);
    }
  }

  // Départages : Buchholz (somme des points finaux des adversaires),
  // Buchholz tronqué (on retire l'adversaire le plus faible),
  // Sonneborn-Berger (somme pondérée par le résultat contre chaque adversaire).
  const opponentsByPlayer = new Map<string, number[]>();
  for (const m of matchups) {
    const opponentPoints = rows.get(m.opponentId)?.matchPoints ?? 0;
    const list = opponentsByPlayer.get(m.playerId) ?? [];
    list.push(opponentPoints);
    opponentsByPlayer.set(m.playerId, list);

    const row = ensure(m.playerId);
    if (m.outcome === "WIN") row.sonnebornBerger += opponentPoints;
    else if (m.outcome === "DRAW") row.sonnebornBerger += opponentPoints / 2;
  }

  for (const [playerId, opponentPointsList] of opponentsByPlayer) {
    const row = ensure(playerId);
    const sum = opponentPointsList.reduce((a, b) => a + b, 0);
    row.buchholz = sum;
    row.buchholzTruncated =
      opponentPointsList.length > 1 ? sum - Math.min(...opponentPointsList) : sum;
  }

  return [...rows.values()].sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    if (b.sonnebornBerger !== a.sonnebornBerger) return b.sonnebornBerger - a.sonnebornBerger;
    if (b.diff !== a.diff) return b.diff - a.diff;
    return b.pointsFor - a.pointsFor;
  });
}
