import { prisma } from "@/lib/prisma";
import { computeClassicStandings } from "@/lib/classic/standings";
import { computeClassicTeamStandings } from "@/lib/classic/teamStandings";
import { computeClassicPoolStandings } from "@/lib/classic/poolStandings";
import { computeClassicTeamPoolStandings } from "@/lib/classic/teamPoolStandings";
import { computeDuplicateStandings } from "@/lib/duplicate/standings";
import { computeDuplicateTeamStandings } from "@/lib/duplicate/teamStandings";
import { reconstructBoard } from "@/lib/duplicate/board";

const matchStatusLabel: Record<string, string> = {
  SCHEDULED: "À jouer",
  PLAYED: "Joué",
  FORFEIT_HOME: "Forfait (domicile)",
  FORFEIT_AWAY: "Forfait (extérieur)",
  CANCELLED: "Annulé",
};

function formatDiff(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

export interface DisplayStandingRow {
  rank: number;
  name: string;
  columns: { label: string; value: string }[];
}

export interface DisplayStandingGroup {
  name: string | null;
  rows: DisplayStandingRow[];
}

export interface DisplayMatchClock {
  initialSeconds: number;
  homeRemainingSeconds: number;
  awayRemainingSeconds: number;
  runningSide: "HOME" | "AWAY" | null;
  startedAt: string | null;
}

export interface DisplayRoundMatch {
  table: number | null;
  home: string;
  away: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  isBye: boolean;
  clock: DisplayMatchClock | null;
}

export interface DisplayRoundGroup {
  name: string | null;
  matches: DisplayRoundMatch[];
}

export interface DisplayDuplicateRow {
  rank: number;
  name: string;
  score: number;
  penalty: number;
  net: number;
}

export interface DisplayGameTimer {
  durationSeconds: number;
  remainingSeconds: number;
  running: boolean;
  startedAt: string | null;
}

export type DisplayCurrent =
  | { kind: "matches"; label: string; groups: DisplayRoundGroup[] }
  | {
      kind: "duplicate";
      label: string;
      rows: DisplayDuplicateRow[];
      timer: DisplayGameTimer | null;
      grid: (string | null)[][] | null;
    };

export interface DisplayData {
  tournamentName: string;
  tournamentStatus: string;
  standingsTitle: string;
  standingsGroups: DisplayStandingGroup[];
  current: DisplayCurrent;
  updatedAt: string;
}

async function buildStandings(tournament: {
  id: string;
  type: string;
  format: string | null;
  isTeamEvent: boolean;
}): Promise<{ title: string; groups: DisplayStandingGroup[] }> {
  if (tournament.type === "CLASSIC") {
    if (tournament.format === "GROUPS") {
      if (tournament.isTeamEvent) {
        const pools = await computeClassicTeamPoolStandings(tournament.id);
        return {
          title: "Classement par poule — Équipes",
          groups: pools.map((pool) => ({
            name: pool.poolName,
            rows: pool.standings.map((s, i) => ({
              rank: i + 1,
              name: s.name,
              columns: [
                { label: "Pts", value: String(s.matchPoints) },
                { label: "Éch.", value: `${s.boardsWon}-${s.boardsLost}` },
                { label: "Diff", value: formatDiff(s.diff) },
              ],
            })),
          })),
        };
      }
      const pools = await computeClassicPoolStandings(tournament.id);
      return {
        title: "Classement par poule",
        groups: pools.map((pool) => ({
          name: pool.poolName,
          rows: pool.standings.map((s, i) => ({
            rank: i + 1,
            name: `${s.firstName} ${s.lastName}`,
            columns: [
              { label: "Pts", value: String(s.matchPoints) },
              { label: "Diff", value: formatDiff(s.diff) },
            ],
          })),
        })),
      };
    }
    if (tournament.isTeamEvent) {
      const rows = await computeClassicTeamStandings(tournament.id);
      return {
        title: "Classement par équipes",
        groups: [
          {
            name: null,
            rows: rows.map((s, i) => ({
              rank: i + 1,
              name: s.name,
              columns: [
                { label: "Pts", value: String(s.matchPoints) },
                { label: "Éch.", value: `${s.boardsWon}-${s.boardsLost}` },
                { label: "Diff", value: formatDiff(s.diff) },
              ],
            })),
          },
        ],
      };
    }
    const rows = await computeClassicStandings(tournament.id);
    return {
      title: "Classement",
      groups: [
        {
          name: null,
          rows: rows.map((s, i) => ({
            rank: i + 1,
            name: `${s.firstName} ${s.lastName}`,
            columns: [
              { label: "Pts", value: String(s.matchPoints) },
              { label: "Diff", value: formatDiff(s.diff) },
            ],
          })),
        },
      ],
    };
  }

  // DUPLICATE
  if (tournament.isTeamEvent) {
    const rows = await computeDuplicateTeamStandings(tournament.id);
    return {
      title: "Classement par équipes",
      groups: [
        {
          name: null,
          rows: rows.map((s, i) => ({
            rank: i + 1,
            name: s.name,
            columns: [
              { label: "%", value: s.pourcentage != null ? s.pourcentage.toFixed(2) : "—" },
              { label: "Négatif", value: s.negatif != null ? String(s.negatif) : "—" },
              { label: "Cumul", value: String(s.net) },
            ],
          })),
        },
      ],
    };
  }
  const rows = await computeDuplicateStandings(tournament.id);
  return {
    title: "Classement",
    groups: [
      {
        name: null,
        rows: rows.map((s, i) => ({
          rank: i + 1,
          name: `${s.firstName} ${s.lastName}`,
          columns: [
            { label: "Cumul", value: String(s.net) },
            { label: "Parties", value: String(s.gamesPlayed) },
          ],
        })),
      },
    ],
  };
}

async function buildCurrent(tournament: { id: string; type: string }): Promise<DisplayCurrent> {
  if (tournament.type === "CLASSIC") {
    const lastRound = await prisma.round.findFirst({
      where: { tournamentId: tournament.id },
      orderBy: { number: "desc" },
      include: {
        matches: {
          include: { homePlayer: true, awayPlayer: true, homeTeam: true, awayTeam: true, pool: true },
          orderBy: { table: "asc" },
        },
      },
    });
    if (!lastRound) return { kind: "matches", label: "Aucune ronde", groups: [] };

    const grouped = lastRound.matches.some((m) => m.poolId);
    const groupsMap = new Map<string, DisplayRoundMatch[]>();
    for (const m of lastRound.matches) {
      const groupName = grouped ? m.pool?.name ?? "—" : "";
      const homeName = m.homeTeam
        ? m.homeTeam.name
        : m.homePlayer
          ? `${m.homePlayer.firstName} ${m.homePlayer.lastName}`
          : "?";
      const awayName = m.isBye
        ? null
        : m.awayTeam
          ? m.awayTeam.name
          : m.awayPlayer
            ? `${m.awayPlayer.firstName} ${m.awayPlayer.lastName}`
            : "?";
      const arr = groupsMap.get(groupName) ?? [];
      arr.push({
        table: m.table,
        home: homeName,
        away: awayName,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        status: matchStatusLabel[m.status] ?? m.status,
        isBye: m.isBye,
        clock:
          m.clockInitialSeconds == null
            ? null
            : {
                initialSeconds: m.clockInitialSeconds,
                homeRemainingSeconds: m.homeClockRemainingSeconds ?? m.clockInitialSeconds,
                awayRemainingSeconds: m.awayClockRemainingSeconds ?? m.clockInitialSeconds,
                runningSide: m.clockRunningSide as "HOME" | "AWAY" | null,
                startedAt: m.clockStartedAt ? m.clockStartedAt.toISOString() : null,
              },
      });
      groupsMap.set(groupName, arr);
    }
    return {
      kind: "matches",
      label: `Ronde ${lastRound.number}`,
      groups: [...groupsMap.entries()].map(([name, matches]) => ({ name: name || null, matches })),
    };
  }

  const lastGame = await prisma.game.findFirst({
    where: { tournamentId: tournament.id },
    orderBy: { number: "desc" },
    include: { results: { include: { player: true } }, referenceMoves: true },
  });
  if (!lastGame) {
    return { kind: "duplicate", label: "Aucune partie", rows: [], timer: null, grid: null };
  }

  const rows = lastGame.results
    .map((r) => ({
      name: `${r.player.firstName} ${r.player.lastName}`,
      score: r.score,
      penalty: r.penalty,
      net: r.score - r.penalty,
    }))
    .sort((a, b) => b.net - a.net)
    .map((r, i) => ({ rank: i + 1, ...r }));

  return {
    kind: "duplicate",
    label: `Partie ${lastGame.number}`,
    rows,
    grid: lastGame.referenceMoves.length > 0 ? reconstructBoard(lastGame.referenceMoves) : null,
    timer: {
      durationSeconds: lastGame.timerDurationSeconds,
      remainingSeconds: lastGame.timerRemainingSeconds ?? lastGame.timerDurationSeconds,
      running: lastGame.timerRunning,
      startedAt: lastGame.timerStartedAt ? lastGame.timerStartedAt.toISOString() : null,
    },
  };
}

export async function getDisplayData(tournamentId: string): Promise<DisplayData> {
  const tournament = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });

  const [{ title, groups }, current] = await Promise.all([
    buildStandings(tournament),
    buildCurrent(tournament),
  ]);

  return {
    tournamentName: tournament.name,
    tournamentStatus: tournament.status,
    standingsTitle: title,
    standingsGroups: groups,
    current,
    updatedAt: new Date().toISOString(),
  };
}
