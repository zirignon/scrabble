import type { Pairing } from "@/lib/classic/pairing";

export interface SwissStanding {
  playerId: string;
  matchPoints: number;
}

export type SwissSeedingMode = "RANDOM" | "RATING";

// Ordonne les entrants (joueurs ou équipes) avant le tout premier
// appariement suisse : à ce stade tout le monde est à 0 point de match, donc
// generateSwissRound (qui trie par points puis apparie de proche en proche)
// ne fait que reprendre l'ordre reçu en entrée sans le changer (tri stable).
// Deux modes, au choix de l'organisateur :
//  - RANDOM : tirage au sort (mélange de Fisher-Yates).
//  - RATING : classement par force décroissante (Elo classique, ou moyenne
//    d'équipe), les entrants sans valeur renseignée étant classés derniers.
// Sans effet à partir de la ronde 2 (les points de match les départagent
// alors déjà, au moins partiellement).
export function seedFirstSwissRound<T extends { playerId: string }>(
  standings: T[],
  mode: SwissSeedingMode,
  ratingByEntrant: Map<string, number | null>
): T[] {
  if (mode === "RANDOM") {
    const shuffled = [...standings];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
  return [...standings].sort(
    (a, b) => (ratingByEntrant.get(b.playerId) ?? -1) - (ratingByEntrant.get(a.playerId) ?? -1)
  );
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
