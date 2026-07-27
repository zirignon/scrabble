import { prisma } from "@/lib/prisma";

export interface DuplicateStandingRow {
  playerId: string;
  firstName: string;
  lastName: string;
  licenseNumber: string | null;
  category: string | null;
  classification: string | null;
  clubName: string | null;
  nationality: string | null;
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
      include: { player: { include: { club: true } } },
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
      licenseNumber: reg.player.licenseNumber,
      category: reg.player.category,
      classification: reg.player.classification,
      clubName: reg.player.club?.name ?? null,
      nationality: reg.player.nationality,
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
        licenseNumber: null,
        category: null,
        classification: null,
        clubName: null,
        nationality: null,
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

export interface DuplicateStandingGameColumn {
  gameNumber: number;
  top: number | null;
}

export interface DuplicateStandingRowWithGames extends DuplicateStandingRow {
  // Net par partie, indexé par numéro de partie (absent si le joueur n'a
  // pas de résultat enregistré pour cette partie).
  perGame: Record<number, number>;
}

export interface DuplicateStandingsWithGames {
  rows: DuplicateStandingRowWithGames[];
  games: DuplicateStandingGameColumn[];
  // Somme des tops de chaque partie (le "cumul" maximal théorique), null si
  // au moins une partie n'a pas de top renseigné.
  topCumul: number | null;
}

// Classement général duplicate avec le détail partie par partie (une
// colonne par partie, plus une ligne de référence donnant le top de
// chaque partie et son cumul) — reprend le format des feuilles de
// classement officielles (Place, Licence, Cumul, P1, P2...).
export async function computeDuplicateStandingsWithGames(
  tournamentId: string
): Promise<DuplicateStandingsWithGames> {
  const [baseRows, games, results] = await Promise.all([
    computeDuplicateStandings(tournamentId),
    prisma.game.findMany({
      where: { tournamentId },
      orderBy: { number: "asc" },
      select: { number: true, top: true },
    }),
    prisma.duplicateResult.findMany({
      where: { game: { tournamentId } },
      select: { playerId: true, score: true, penalty: true, game: { select: { number: true } } },
    }),
  ]);

  const perGameByPlayer = new Map<string, Record<number, number>>();
  for (const result of results) {
    const entry = perGameByPlayer.get(result.playerId) ?? {};
    entry[result.game.number] = result.score - result.penalty;
    perGameByPlayer.set(result.playerId, entry);
  }

  const rows: DuplicateStandingRowWithGames[] = baseRows.map((row) => ({
    ...row,
    perGame: perGameByPlayer.get(row.playerId) ?? {},
  }));

  const gameColumns: DuplicateStandingGameColumn[] = games.map((g) => ({
    gameNumber: g.number,
    top: g.top,
  }));
  const topCumul =
    gameColumns.length > 0 && gameColumns.every((g) => g.top !== null)
      ? gameColumns.reduce((sum, g) => sum + (g.top ?? 0), 0)
      : null;

  return { rows, games: gameColumns, topCumul };
}
