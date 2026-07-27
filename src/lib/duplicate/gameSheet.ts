import { prisma } from "@/lib/prisma";
import { computeGameTop } from "@/lib/duplicate/board";

export interface GameClassementRow {
  playerId: string;
  firstName: string;
  lastName: string;
  licenseNumber: string | null;
  category: string | null;
  classification: string | null;
  clubName: string | null;
  federation: string | null;
  nationality: string | null;
  // Score net (score - pénalité) par partie, indexé par numéro de partie
  // (de 1 à la partie courante).
  perGame: Record<number, number>;
  // Somme des net des parties 1..N jouées par ce joueur.
  cumul: number;
  negatif: number | null;
  pourcentage: number | null;
}

export interface GameClassementGameColumn {
  gameNumber: number;
  top: number | null;
}

export interface GameClassementSheet {
  rows: GameClassementRow[];
  games: GameClassementGameColumn[];
  // Somme des tops des parties 1..N (référence commune à la feuille), null
  // si au moins une de ces parties n'a pas de top renseigné.
  cumulTop: number | null;
}

// Fiche de classement d'une partie duplicate : reprend le classement
// général du tournoi, tronqué aux parties 1 à N (N = numéro de la partie
// consultée) — une colonne par partie jouée jusque-là, plus le cumul,
// le négatif et le pourcentage calculés sur ce cumul.
export async function computeGameClassementSheet(
  gameId: string
): Promise<GameClassementSheet> {
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      results: {
        include: { player: { include: { club: true } } },
      },
    },
  });

  const priorGames = await prisma.game.findMany({
    where: { tournamentId: game.tournamentId, number: { lte: game.number } },
    orderBy: { number: "asc" },
    select: { number: true, top: true, referenceMoves: { select: { points: true } } },
  });
  const games: GameClassementGameColumn[] = priorGames.map((g) => ({
    gameNumber: g.number,
    top: computeGameTop(g.referenceMoves, g.top),
  }));
  const cumulTop = games.every((g) => g.top !== null)
    ? games.reduce((sum, g) => sum + (g.top ?? 0), 0)
    : null;

  const playerIds = game.results.map((r) => r.playerId);
  const priorResults = await prisma.duplicateResult.findMany({
    where: {
      playerId: { in: playerIds },
      game: { tournamentId: game.tournamentId, number: { lte: game.number } },
    },
    select: { playerId: true, score: true, penalty: true, game: { select: { number: true } } },
  });
  const perGameByPlayer = new Map<string, Record<number, number>>();
  for (const result of priorResults) {
    const entry = perGameByPlayer.get(result.playerId) ?? {};
    entry[result.game.number] = result.score - result.penalty;
    perGameByPlayer.set(result.playerId, entry);
  }

  const rows: GameClassementRow[] = game.results.map((result) => {
    const perGame = perGameByPlayer.get(result.playerId) ?? {};
    const cumul = Object.values(perGame).reduce((sum, v) => sum + v, 0);
    const negatif = cumulTop != null ? cumul - cumulTop : null;
    const pourcentage = cumulTop != null && cumulTop > 0 ? (cumul / cumulTop) * 100 : null;

    return {
      playerId: result.playerId,
      firstName: result.player.firstName,
      lastName: result.player.lastName,
      licenseNumber: result.player.licenseNumber,
      category: result.player.category,
      classification: result.player.classification,
      clubName: result.player.club?.name ?? null,
      federation: result.player.club?.federation ?? null,
      nationality: result.player.nationality,
      perGame,
      cumul,
      negatif,
      pourcentage,
    };
  });

  return { rows: rows.sort((a, b) => b.cumul - a.cumul), games, cumulTop };
}
