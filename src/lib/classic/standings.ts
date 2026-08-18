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
  // Sous-ensemble des défaites dues à un forfait (absence), distinct d'une
  // défaite après une partie réellement jouée — voir applyResult.
  forfeits: number;
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
        forfeits: 0,
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

  // Barème : victoire 3 pts, nul 2 pts, défaite jouée 1 pt, forfait (absence)
  // 0 pt — le seul écart avec une "vraie" défaite est ce dernier point,
  // c'est ce qui distingue un joueur présent mais battu d'un joueur absent.
  function applyResult(
    playerId: string,
    opponentId: string,
    outcome: Outcome,
    pointsFor: number,
    pointsAgainst: number,
    isForfeitLoss = false
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
      row.matchPoints += 2;
    } else {
      row.losses += 1;
      if (isForfeitLoss) {
        row.forfeits += 1;
      } else {
        row.matchPoints += 1;
      }
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
        applyResult(match.homePlayerId, match.awayPlayerId, "LOSS", match.homeScore ?? 0, match.awayScore ?? 0, true);
        applyResult(match.awayPlayerId, match.homePlayerId, "WIN", match.awayScore ?? 0, match.homeScore ?? 0);
      } else if (match.status === "FORFEIT_AWAY") {
        participantsThisRound.add(match.homePlayerId);
        participantsThisRound.add(match.awayPlayerId);
        applyResult(match.homePlayerId, match.awayPlayerId, "WIN", match.homeScore ?? 0, match.awayScore ?? 0);
        applyResult(match.awayPlayerId, match.homePlayerId, "LOSS", match.awayScore ?? 0, match.homeScore ?? 0, true);
      } else if (match.status === "FORFEIT_BOTH") {
        // Les deux camps sont absents : 0 point chacun, comme un forfait
        // simple — pas de vainqueur, à ne pas confondre avec un match nul
        // réellement joué (2 points chacun).
        participantsThisRound.add(match.homePlayerId);
        participantsThisRound.add(match.awayPlayerId);
        applyResult(match.homePlayerId, match.awayPlayerId, "LOSS", match.homeScore ?? 0, match.awayScore ?? 0, true);
        applyResult(match.awayPlayerId, match.homePlayerId, "LOSS", match.awayScore ?? 0, match.homeScore ?? 0, true);
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
    const cmp = compareStandingRows(a, b);
    if (cmp !== 0) return cmp;
    const outcome = headToHead.get(`${a.playerId}:${b.playerId}`);
    if (outcome === "WIN") return -1;
    if (outcome === "LOSS") return 1;
    return 0;
  });
}

// Ordre de départage (du plus déterminant au moins déterminant) : points de
// match, différence de points, Sonneborn-Berger, Buchholz, Buchholz médian,
// score cumulé, puis en tout dernier recours le total de points marqués.
// Extrait de computeStandingsFromMatches pour être réutilisé par
// computeClassicSwissPhaseStandings, qui recompose un classement par simple
// addition de deux phases (poules + suisse) sans historique de rencontres
// directes disponible entre les deux — la confrontation directe (dernier
// critère ci-dessus) ne peut donc pas s'y appliquer.
export function compareStandingRows(a: ClassicStandingRow, b: ClassicStandingRow): number {
  if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
  if (b.diff !== a.diff) return b.diff - a.diff;
  if (b.sonnebornBerger !== a.sonnebornBerger) return b.sonnebornBerger - a.sonnebornBerger;
  if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
  if (b.buchholzMedian !== a.buchholzMedian) return b.buchholzMedian - a.buchholzMedian;
  if (b.cumulativeScore !== a.cumulativeScore) return b.cumulativeScore - a.cumulativeScore;
  return b.pointsFor - a.pointsFor;
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
      classification: r.player.classificationClassic,
      clubName: r.player.club?.name ?? null,
      federation: r.player.federation ?? r.player.club?.federation ?? null,
    })),
    matches.map((m) => ({ ...m, roundNumber: m.round.number }))
  );
}

// Classement de la phase suisse d'un tournoi COMBINED (poules puis suisse) :
// poursuit le classement général de poules (voir
// computeClassicGeneralPoolStandings) plutôt que de repartir d'un
// mini-tournoi isolé à 0 partout pour les qualifiés — les statistiques
// (J/V/N/D/Pts/Diff/départages) accumulées en poules s'ajoutent à celles de
// la phase suisse, en continuité du même classement général. Les qualifiés
// et leurs matchs suisses sont retrouvés directement à partir des rondes
// marquées isSwissPhase ; la confrontation directe (dernier critère de
// computeStandingsFromMatches) ne s'applique pas ici, l'addition de deux
// phases ne conservant pas un historique de rencontres unique — voir
// compareStandingRows.
export async function computeClassicSwissPhaseStandings(
  tournamentId: string
): Promise<ClassicStandingRow[]> {
  const matches = await prisma.match.findMany({
    where: { round: { tournamentId, isSwissPhase: true } },
    include: { round: true },
  });

  const playerIds = new Set<string>();
  for (const m of matches) {
    if (m.homePlayerId) playerIds.add(m.homePlayerId);
    if (m.awayPlayerId) playerIds.add(m.awayPlayerId);
  }
  if (playerIds.size === 0) return [];

  const players = await prisma.player.findMany({
    where: { id: { in: [...playerIds] } },
    include: { club: true },
  });

  const swissStandings = computeStandingsFromMatches(
    players.map((p) => ({
      playerId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      category: p.category,
      classification: p.classificationClassic,
      clubName: p.club?.name ?? null,
      federation: p.federation ?? p.club?.federation ?? null,
    })),
    matches.map((m) => ({ ...m, roundNumber: m.round.number }))
  );

  const { computeClassicGeneralPoolStandings } = await import("@/lib/classic/poolStandings");
  const generalPoolStandings = await computeClassicGeneralPoolStandings(tournamentId);
  const poolByPlayerId = new Map(generalPoolStandings.map((s) => [s.playerId, s]));

  return swissStandings
    .map((row): ClassicStandingRow => {
      const poolRow = poolByPlayerId.get(row.playerId);
      if (!poolRow) return row;
      return {
        ...row,
        played: poolRow.played + row.played,
        wins: poolRow.wins + row.wins,
        draws: poolRow.draws + row.draws,
        losses: poolRow.losses + row.losses,
        forfeits: poolRow.forfeits + row.forfeits,
        matchPoints: poolRow.matchPoints + row.matchPoints,
        pointsFor: poolRow.pointsFor + row.pointsFor,
        pointsAgainst: poolRow.pointsAgainst + row.pointsAgainst,
        diff: poolRow.diff + row.diff,
        buchholz: poolRow.buchholz + row.buchholz,
        buchholzTruncated: poolRow.buchholzTruncated + row.buchholzTruncated,
        buchholzMedian: poolRow.buchholzMedian + row.buchholzMedian,
        sonnebornBerger: poolRow.sonnebornBerger + row.sonnebornBerger,
        cumulativeScore: poolRow.cumulativeScore + row.cumulativeScore,
      };
    })
    .sort(compareStandingRows);
}
