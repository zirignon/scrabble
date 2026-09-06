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
//
// En nombre impair, l'effectif est complété par un joueur virtuel X (jamais
// un vrai playerId, jamais persisté ni affiché tel quel — il ressort
// toujours converti en simple exempt, away: null, voir Match.isBye) :
// exactement comme un adversaire réel, X est apparié en priorité à un
// joueur qui ne l'a pas déjà affronté (playersWithBye), en commençant par le
// moins bien classé — il reste donc "au bas du classement" — et ne retombe
// sur une revanche (recroise un joueur déjà exempté) que si tout le monde
// l'a déjà affronté, comme pour tout autre adversaire épuisé.
export function generateSwissRound(
  standings: SwissStanding[],
  previousOpponents: Map<string, Set<string>>,
  playersWithBye: Set<string>
): Pairing[] {
  const order = [...standings]
    .sort((a, b) => b.matchPoints - a.matchPoints)
    .map((s) => s.playerId);

  let opponentOfX: string | null = null;
  if (order.length % 2 !== 0) {
    for (let i = order.length - 1; i >= 0; i--) {
      if (!playersWithBye.has(order[i])) {
        opponentOfX = order[i];
        break;
      }
    }
    if (opponentOfX === null) opponentOfX = order[order.length - 1];
    order.splice(order.indexOf(opponentOfX), 1);
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

  // Match contre X converti en simple exempt (aucun opposant réel).
  if (opponentOfX) {
    pairings.push({ home: opponentOfX, away: null });
  }

  return pairings;
}

// Variante de generateSwissRound qui isole les joueurs forfait à la ronde
// précédente : ils sont envoyés en bas du classement pour l'appariement et
// se rencontrent entre eux plutôt que d'imposer une "victoire gratuite" à un
// joueur présent. En nombre impair, le forfait restant affronte le dernier
// joueur présent au classement (plutôt qu'un joueur mieux classé) ; les
// joueurs présents restants sont ensuite appariés normalement, bye compris.
// Sans effet si personne n'était forfait à la ronde précédente.
export function generateSwissRoundWithForfeits(
  standings: SwissStanding[],
  previousOpponents: Map<string, Set<string>>,
  playersWithBye: Set<string>,
  forfeitedLastRound: Set<string>
): Pairing[] {
  const forfeits = standings.filter((s) => forfeitedLastRound.has(s.playerId));
  if (forfeits.length === 0) {
    return generateSwissRound(standings, previousOpponents, playersWithBye);
  }

  const presentsSorted = standings
    .filter((s) => !forfeitedLastRound.has(s.playerId))
    .sort((a, b) => b.matchPoints - a.matchPoints);
  const forfeitPool = [...forfeits];
  const pairings: Pairing[] = [];

  if (forfeitPool.length % 2 !== 0) {
    const extra = forfeitPool.pop()!;
    const lastPresent = presentsSorted.pop();
    // Le dernier joueur présent au classement affronte le forfait restant
    // plutôt qu'un bye ou un joueur mieux classé — s'il n'y a personne
    // d'autre de présent, le forfait reste seul (traité comme un bye).
    pairings.push({ home: extra.playerId, away: lastPresent?.playerId ?? null });
  }

  // forfeitPool est désormais de taille paire : pas de bye à gérer ici.
  pairings.push(...generateSwissRound(forfeitPool, previousOpponents, new Set()));
  pairings.push(...generateSwissRound(presentsSorted, previousOpponents, playersWithBye));

  return pairings;
}
