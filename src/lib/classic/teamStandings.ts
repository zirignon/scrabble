import { prisma } from "@/lib/prisma";

export interface ClassicTeamStandingRow {
  teamId: string;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  matchPoints: number;
  boardsWon: number;
  boardsDrawn: number;
  boardsLost: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
}

export interface TeamStandingsMatchLike {
  roundId: string;
  isBye: boolean;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

// Cœur du calcul de classement par équipes à partir des échiquiers
// individuels : une confrontation d'équipes (ronde + paire d'équipes) est
// regroupée à partir des matchs de ses différents échiquiers. Le résultat
// du match d'équipes se décide à la majorité d'échiquiers gagnés (3 pts
// victoire, 1 pt égalité, 0 pt défaite). Départage : différentiel
// d'échiquiers (gagnés − perdus) puis différence de points cumulés. Une
// confrontation n'est comptabilisée que lorsque tous ses échiquiers sont
// joués (aucun encore SCHEDULED). Factorisé pour être réutilisé aussi bien
// sur l'ensemble d'un tournoi que sur une poule d'équipes.
export function computeTeamStandingsFromMatches(
  teams: Array<{ teamId: string; name: string }>,
  matches: TeamStandingsMatchLike[]
): ClassicTeamStandingRow[] {
  const rows = new Map<string, ClassicTeamStandingRow>();
  function ensure(teamId: string, name: string) {
    if (!rows.has(teamId)) {
      rows.set(teamId, {
        teamId,
        name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        matchPoints: 0,
        boardsWon: 0,
        boardsDrawn: 0,
        boardsLost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        diff: 0,
      });
    }
    return rows.get(teamId)!;
  }
  for (const team of teams) ensure(team.teamId, team.name);

  const encounters = new Map<
    string,
    { homeTeamId: string; awayTeamId: string; matches: TeamStandingsMatchLike[] }
  >();

  for (const m of matches) {
    if (m.isBye) {
      if (m.homeTeamId) {
        const row = ensure(m.homeTeamId, rows.get(m.homeTeamId)?.name ?? "");
        row.played += 1;
        row.wins += 1;
        row.matchPoints += 3;
      }
      continue;
    }
    if (!m.homeTeamId || !m.awayTeamId) continue;

    const key = `${m.roundId}:${m.homeTeamId}:${m.awayTeamId}`;
    if (!encounters.has(key)) {
      encounters.set(key, { homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, matches: [] });
    }
    encounters.get(key)!.matches.push(m);
  }

  for (const { homeTeamId, awayTeamId, matches: boards } of encounters.values()) {
    const allDecided = boards.every((b) => b.status !== "SCHEDULED");
    if (!allDecided) continue;

    const home = ensure(homeTeamId, rows.get(homeTeamId)?.name ?? "");
    const away = ensure(awayTeamId, rows.get(awayTeamId)?.name ?? "");

    let homeBoardsWon = 0;
    let awayBoardsWon = 0;
    let boardsDrawn = 0;
    let homePointsFor = 0;
    let awayPointsFor = 0;

    for (const board of boards) {
      if (board.status === "PLAYED" && board.homeScore != null && board.awayScore != null) {
        homePointsFor += board.homeScore;
        awayPointsFor += board.awayScore;
        if (board.homeScore > board.awayScore) homeBoardsWon += 1;
        else if (board.homeScore < board.awayScore) awayBoardsWon += 1;
        else boardsDrawn += 1;
      } else if (board.status === "FORFEIT_HOME") {
        awayBoardsWon += 1;
      } else if (board.status === "FORFEIT_AWAY") {
        homeBoardsWon += 1;
      }
      // CANCELLED : échiquier non comptabilisé.
    }

    home.boardsWon += homeBoardsWon;
    home.boardsLost += awayBoardsWon;
    home.boardsDrawn += boardsDrawn;
    home.pointsFor += homePointsFor;
    home.pointsAgainst += awayPointsFor;

    away.boardsWon += awayBoardsWon;
    away.boardsLost += homeBoardsWon;
    away.boardsDrawn += boardsDrawn;
    away.pointsFor += awayPointsFor;
    away.pointsAgainst += homePointsFor;

    home.played += 1;
    away.played += 1;
    if (homeBoardsWon > awayBoardsWon) {
      home.wins += 1;
      home.matchPoints += 3;
      away.losses += 1;
    } else if (homeBoardsWon < awayBoardsWon) {
      away.wins += 1;
      away.matchPoints += 3;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.matchPoints += 1;
      away.matchPoints += 1;
    }
  }

  for (const row of rows.values()) {
    row.diff = row.pointsFor - row.pointsAgainst;
  }

  return [...rows.values()].sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    const aBoardDiff = a.boardsWon - a.boardsLost;
    const bBoardDiff = b.boardsWon - b.boardsLost;
    if (bBoardDiff !== aBoardDiff) return bBoardDiff - aBoardDiff;
    if (b.diff !== a.diff) return b.diff - a.diff;
    return b.pointsFor - a.pointsFor;
  });
}

export async function computeClassicTeamStandings(
  tournamentId: string
): Promise<ClassicTeamStandingRow[]> {
  const [teams, matches] = await Promise.all([
    prisma.team.findMany({ where: { tournamentId } }),
    prisma.match.findMany({
      where: {
        round: { tournamentId },
        OR: [{ homeTeamId: { not: null } }, { awayTeamId: { not: null } }],
      },
    }),
  ]);

  return computeTeamStandingsFromMatches(
    teams.map((t) => ({ teamId: t.id, name: t.name })),
    matches
  );
}

// Équivalent équipes de computeClassicSwissPhaseStandings : poursuit le
// classement général de poules par équipes (voir
// computeClassicTeamGeneralPoolStandings) en y ajoutant les statistiques de
// la phase suisse, plutôt que de repartir d'un mini-tournoi isolé à 0
// partout (voir le commentaire équivalent côté individuel).
export async function computeClassicTeamSwissPhaseStandings(
  tournamentId: string
): Promise<ClassicTeamStandingRow[]> {
  const matches = await prisma.match.findMany({
    where: {
      round: { tournamentId, isSwissPhase: true },
      OR: [{ homeTeamId: { not: null } }, { awayTeamId: { not: null } }],
    },
  });

  const teamIds = new Set<string>();
  for (const m of matches) {
    if (m.homeTeamId) teamIds.add(m.homeTeamId);
    if (m.awayTeamId) teamIds.add(m.awayTeamId);
  }
  if (teamIds.size === 0) return [];

  const teams = await prisma.team.findMany({ where: { id: { in: [...teamIds] } } });

  const swissStandings = computeTeamStandingsFromMatches(
    teams.map((t) => ({ teamId: t.id, name: t.name })),
    matches
  );

  const { computeClassicTeamGeneralPoolStandings } = await import(
    "@/lib/classic/teamPoolStandings"
  );
  const generalPoolStandings = await computeClassicTeamGeneralPoolStandings(tournamentId);
  const poolByTeamId = new Map(generalPoolStandings.map((s) => [s.teamId, s]));

  return swissStandings
    .map((row): ClassicTeamStandingRow => {
      const poolRow = poolByTeamId.get(row.teamId);
      if (!poolRow) return row;
      return {
        ...row,
        played: poolRow.played + row.played,
        wins: poolRow.wins + row.wins,
        draws: poolRow.draws + row.draws,
        losses: poolRow.losses + row.losses,
        matchPoints: poolRow.matchPoints + row.matchPoints,
        boardsWon: poolRow.boardsWon + row.boardsWon,
        boardsDrawn: poolRow.boardsDrawn + row.boardsDrawn,
        boardsLost: poolRow.boardsLost + row.boardsLost,
        pointsFor: poolRow.pointsFor + row.pointsFor,
        pointsAgainst: poolRow.pointsAgainst + row.pointsAgainst,
        diff: poolRow.diff + row.diff,
      };
    })
    .sort((a, b) => {
      if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
      const aBoardDiff = a.boardsWon - a.boardsLost;
      const bBoardDiff = b.boardsWon - b.boardsLost;
      if (bBoardDiff !== aBoardDiff) return bBoardDiff - aBoardDiff;
      if (b.diff !== a.diff) return b.diff - a.diff;
      return b.pointsFor - a.pointsFor;
    });
}
