import type { Pairing } from "@/lib/classic/pairing";

export interface SwissStanding {
  playerId: string;
  matchPoints: number;
}

// Appariement suisse simplifié : trie les joueurs par score décroissant puis
// les apparie de proche en proche en évitant les rencontres déjà jouées.
// Si aucun adversaire "neuf" n'est disponible, autorise une revanche plutôt
// que de bloquer la génération de la ronde.
export function generateSwissRound(
  standings: SwissStanding[],
  previousOpponents: Map<string, Set<string>>,
  playersWithBye: Set<string>
): Pairing[] {
  const order = [...standings]
    .sort((a, b) => b.matchPoints - a.matchPoints)
    .map((s) => s.playerId);

  let byePlayer: string | null = null;
  if (order.length % 2 !== 0) {
    for (let i = order.length - 1; i >= 0; i--) {
      if (!playersWithBye.has(order[i])) {
        byePlayer = order[i];
        break;
      }
    }
    if (byePlayer === null) byePlayer = order[order.length - 1];
    order.splice(order.indexOf(byePlayer), 1);
  }

  const remaining = [...order];
  const pairings: Pairing[] = [];

  while (remaining.length > 0) {
    const player = remaining.shift() as string;
    const alreadyFaced = previousOpponents.get(player) ?? new Set<string>();

    let opponentIndex = remaining.findIndex((p) => !alreadyFaced.has(p));
    if (opponentIndex === -1) opponentIndex = 0;

    const opponent = remaining.splice(opponentIndex, 1)[0];
    pairings.push({ home: player, away: opponent });
  }

  if (byePlayer) {
    pairings.push({ home: byePlayer, away: null });
  }

  return pairings;
}
