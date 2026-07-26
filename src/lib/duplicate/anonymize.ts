import { prisma } from "@/lib/prisma";

export interface AnonymizedPlayer<T> {
  player: T;
  label: string;
}

// Étiquette anonymisée des joueurs pour la saisie des scores, basée sur le
// classement général cumulé AVANT cette partie (parties de numéro inférieur
// uniquement) : le 1er du classement devient "Joueur 1", le 2e "Joueur 2",
// etc. Le classement à vrais noms reste visible sur les pages de classement
// — seule cette grille de saisie masque l'identité, pour que l'arbitre ne
// puisse pas favoriser un joueur qu'il reconnaîtrait. Pour la 1re partie
// (aucun résultat antérieur), tous les joueurs sont à égalité et l'ordre
// retombe sur le nom de famille, puis le prénom.
export async function anonymizePlayersForGame<
  T extends { id: string; firstName: string; lastName: string }
>(tournamentId: string, gameNumber: number, players: T[]): Promise<AnonymizedPlayer<T>[]> {
  const priorResults = await prisma.duplicateResult.findMany({
    where: { game: { tournamentId, number: { lt: gameNumber } } },
  });

  const netByPlayer = new Map<string, number>();
  for (const result of priorResults) {
    netByPlayer.set(
      result.playerId,
      (netByPlayer.get(result.playerId) ?? 0) + result.score - result.penalty
    );
  }

  return [...players]
    .sort((a, b) => {
      const netDiff = (netByPlayer.get(b.id) ?? 0) - (netByPlayer.get(a.id) ?? 0);
      if (netDiff !== 0) return netDiff;
      return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
    })
    .map((player, i) => ({ player, label: `Joueur ${i + 1}` }));
}
