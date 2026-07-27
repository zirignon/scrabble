import { prisma } from "@/lib/prisma";

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
  score: number;
  penalty: number;
  net: number;
  cumul: number;
  gamesPlayed: number;
  top: number | null;
  negatif: number | null;
  pourcentage: number | null;
}

// Fiche de classement d'une partie duplicate : classe les joueurs selon
// leur performance sur CETTE partie (score net décroissant), tout en
// affichant leur cumul au tournoi (somme des parties jouées jusqu'à
// celle-ci incluse) et les informations d'identification habituelles
// d'une feuille officielle (licence, club, fédération, catégorie).
export async function computeGameClassementSheet(
  gameId: string
): Promise<GameClassementRow[]> {
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      results: {
        include: { player: { include: { club: true } } },
      },
    },
  });

  const previousResults = await prisma.duplicateResult.findMany({
    where: {
      game: { tournamentId: game.tournamentId, number: { lte: game.number } },
    },
  });

  const cumulByPlayer = new Map<string, { net: number; gamesPlayed: number }>();
  for (const result of previousResults) {
    const entry = cumulByPlayer.get(result.playerId) ?? { net: 0, gamesPlayed: 0 };
    entry.net += result.score - result.penalty;
    entry.gamesPlayed += 1;
    cumulByPlayer.set(result.playerId, entry);
  }

  const rows: GameClassementRow[] = game.results.map((result) => {
    const net = result.score - result.penalty;
    const cumul = cumulByPlayer.get(result.playerId)?.net ?? net;
    const gamesPlayed = cumulByPlayer.get(result.playerId)?.gamesPlayed ?? 1;
    const negatif = game.top != null ? net - game.top : null;
    const pourcentage = game.top != null && game.top > 0 ? (net / game.top) * 100 : null;

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
      score: result.score,
      penalty: result.penalty,
      net,
      cumul,
      gamesPlayed,
      top: game.top,
      negatif,
      pourcentage,
    };
  });

  return rows.sort((a, b) => b.net - a.net);
}
