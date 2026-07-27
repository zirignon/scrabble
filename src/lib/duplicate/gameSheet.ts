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
  gamesPlayed: number;
  // Score brut du joueur sur cette partie : le total des points de ses
  // coups, avant pénalité.
  score: number;
  penalty: number;
  // net = score - penalty, pour cette partie.
  net: number;
  top: number | null;
  negatif: number | null;
  pourcentage: number | null;
}

export interface GameClassementSheet {
  rows: GameClassementRow[];
  // Cumul des tops : somme des tops de chaque partie jouée jusqu'à
  // celle-ci incluse (et non la somme des scores des joueurs). Ce n'est
  // pas propre à un joueur — c'est une référence commune à toute la
  // feuille, comme le top d'une partie individuelle.
  cumulTop: number | null;
}

// Fiche de classement d'une partie duplicate : classe les joueurs selon
// leur performance sur CETTE partie (score net décroissant), avec les
// informations d'identification habituelles d'une feuille officielle
// (licence, club, fédération, catégorie, classification, nationalité).
export async function computeGameClassementSheet(
  gameId: string
): Promise<GameClassementSheet> {
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      results: {
        include: { player: { include: { club: true } } },
      },
      referenceMoves: { select: { points: true } },
    },
  });
  const top = computeGameTop(game.referenceMoves, game.top);

  const priorGames = await prisma.game.findMany({
    where: { tournamentId: game.tournamentId, number: { lte: game.number } },
    select: { top: true, referenceMoves: { select: { points: true } } },
  });
  const priorTops = priorGames.map((g) => computeGameTop(g.referenceMoves, g.top));
  const cumulTop = priorTops.every((t) => t !== null)
    ? priorTops.reduce((sum, t) => sum + (t ?? 0), 0)
    : null;

  const previousResults = await prisma.duplicateResult.findMany({
    where: {
      game: { tournamentId: game.tournamentId, number: { lte: game.number } },
    },
  });
  const gamesPlayedByPlayer = new Map<string, number>();
  for (const result of previousResults) {
    gamesPlayedByPlayer.set(
      result.playerId,
      (gamesPlayedByPlayer.get(result.playerId) ?? 0) + 1
    );
  }

  const rows: GameClassementRow[] = game.results.map((result) => {
    const net = result.score - result.penalty;
    const negatif = top != null ? net - top : null;
    const pourcentage = top != null && top > 0 ? (net / top) * 100 : null;

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
      gamesPlayed: gamesPlayedByPlayer.get(result.playerId) ?? 1,
      score: result.score,
      penalty: result.penalty,
      net,
      top,
      negatif,
      pourcentage,
    };
  });

  return { rows: rows.sort((a, b) => b.net - a.net), cumulTop };
}
