import { prisma } from "@/lib/prisma";

export interface ClassicStandingRow {
  playerId: string;
  firstName: string;
  lastName: string;
  category: string | null;
  classification: string | null;
  clubName: string | null;
  federation: string | null;
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
  buchholzMedian: number;
  sonnebornBerger: number;
  cumulativeScore: number;
}

type Outcome = "WIN" | "DRAW" | "LOSS";

export interface StandingsMatchLike {
  isBye: boolean;
  homePlayerId: string | null;
  awayPlayerId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  roundNumber: number;
}

// Cœur du calcul de classement classique (points de match, différence de
// score, départages Buchholz et Sonneborn-Berger), factorisé pour être
// réutilisé aussi bien sur l'ensemble d'un tournoi que sur une poule.
export function computeStandingsFromMatches(
  players: Array<{
    playerId: string;
    firstName: string;
    lastName: string;
    category?: string | null;
    classification?: string | null;
    clubName?: string | null;
    federation?: string | null;
  }>,
  matches: StandingsMatchLike[]
): ClassicStandingRow[] {
  const rows = new Map<string, ClassicStandingRow>();
  function ensure(playerId: string) {
    if (!rows.has(playerId)) {
      rows.set(playerId, {
        playerId,
        firstName: "?",
        lastName: "",
        category: null,
        classification: null,
        clubName: null,
        federation: null,
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
        buchholzMedian: 0,
        sonnebornBerger: 0,
        cumulativeScore: 0,
      });
    }
    return rows.get(playerId)!;
  }

  for (const player of players) {
    const row = ensure(player.playerId);
    row.firstName = player.firstName;
    row.lastName = player.lastName;
    row.category = player.category ?? null;
    row.classification = player.classification ?? null;
    row.clubName = player.clubName ?? null;
    row.federation = player.federation ?? null;
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
      row.matchPoints += 3;
    } else if (outcome === "DRAW") {
      row.draws += 1;
      row.matchPoints += 1;
    } else {
      row.losses += 1;
    }
    matchups.push({ playerId, opponentId, outcome });
  }

  // Traité ronde par ronde (et non en un seul passage) car le score cumulé
  // progressif a besoin du total de points de match "à ce stade du
  // tournoi", capturé juste après chaque ronde jouée.
  const matchesByRound = new Map<number, StandingsMatchLike[]>();
  for (const match of matches) {
    const list = matchesByRound.get(match.roundNumber) ?? [];
    list.push(match);
    matchesByRound.set(match.roundNumber, list);
  }
  const roundNumbers = [...matchesByRound.keys()].sort((a, b) => a - b);

  for (const roundNumber of roundNumbers) {
    const participantsThisRound = new Set<string>();

    for (const match of matchesByRound.get(roundNumber)!) {
      if (match.isBye) {
        if (match.homePlayerId) {
          const row = ensure(match.homePlayerId);
          row.played += 1;
          row.wins += 1;
          row.matchPoints += 3;
          participantsThisRound.add(match.homePlayerId);
        }
        continue;
      }
      if (!match.homePlayerId || !match.awayPlayerId) continue;

      // Le cumul progressif ne doit compter que les matchs réellement
      // décidés (résultat saisi) : un match encore "à jouer" ne fait pas
      // avancer la ronde pour les deux joueurs concernés.
      if (match.status === "PLAYED" && match.homeScore != null && match.awayScore != null) {
        participantsThisRound.add(match.homePlayerId);
        participantsThisRound.add(match.awayPlayerId);
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
        participantsThisRound.add(match.homePlayerId);
        participantsThisRound.add(match.awayPlayerId);
        applyResult(match.homePlayerId, match.awayPlayerId, "LOSS", match.homeScore ?? 0, match.awayScore ?? 0);
        applyResult(match.awayPlayerId, match.homePlayerId, "WIN", match.awayScore ?? 0, match.homeScore ?? 0);
      } else if (match.status === "FORFEIT_AWAY") {
        participantsThisRound.add(match.homePlayerId);
        participantsThisRound.add(match.awayPlayerId);
        applyResult(match.homePlayerId, match.awayPlayerId, "WIN", match.homeScore ?? 0, match.awayScore ?? 0);
        applyResult(match.awayPlayerId, match.homePlayerId, "LOSS", match.awayScore ?? 0, match.homeScore ?? 0);
      }
    }

    for (const playerId of participantsThisRound) {
      const row = ensure(playerId);
      row.cumulativeScore += row.matchPoints;
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
    // Buchholz médian : on retire le meilleur ET le moins bon adversaire
    // (seulement s'il y a au moins 3 adversaires, sinon on garde le total).
    if (opponentPointsList.length >= 3) {
      const sorted = [...opponentPointsList].sort((a, b) => a - b);
      row.buchholzMedian = sorted.slice(1, -1).reduce((a, b) => a + b, 0);
    } else {
      row.buchholzMedian = sum;
    }
  }

  // Confrontation directe : dernier recours en cas d'égalité parfaite sur
  // tous les critères précédents, si les deux joueurs se sont affrontés.
  const headToHead = new Map<string, Outcome>();
  for (const m of matchups) {
    headToHead.set(`${m.playerId}:${m.opponentId}`, m.outcome);
  }

  return [...rows.values()].sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    if (b.buchholzMedian !== a.buchholzMedian) return b.buchholzMedian - a.buchholzMedian;
    if (b.sonnebornBerger !== a.sonnebornBerger) return b.sonnebornBerger - a.sonnebornBerger;
    if (b.cumulativeScore !== a.cumulativeScore) return b.cumulativeScore - a.cumulativeScore;
    if (b.diff !== a.diff) return b.diff - a.diff;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    const outcome = headToHead.get(`${a.playerId}:${b.playerId}`);
    if (outcome === "WIN") return -1;
    if (outcome === "LOSS") return 1;
    return 0;
  });
}

export async function computeClassicStandings(
  tournamentId: string
): Promise<ClassicStandingRow[]> {
  const [registrations, matches] = await Promise.all([
    prisma.registration.findMany({
      where: { tournamentId },
      include: { player: { include: { club: true } } },
    }),
    prisma.match.findMany({
      where: { round: { tournamentId } },
      include: { round: true },
    }),
  ]);

  return computeStandingsFromMatches(
    registrations.map((r) => ({
      playerId: r.playerId,
      firstName: r.player.firstName,
      lastName: r.player.lastName,
      category: r.player.category,
      classification: r.player.classification,
      clubName: r.player.club?.name ?? null,
      federation: r.player.club?.federation ?? null,
    })),
    matches.map((m) => ({ ...m, roundNumber: m.round.number }))
  );
}
