// Hash simple (FNV-1a) : pas un besoin cryptographique, juste une façon
// déterministe de dériver un ordre qui a l'air aléatoire.
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface AnonymizedPlayer<T> {
  player: T;
  label: string;
}

// Ordre et étiquette anonymisés des joueurs pour la saisie des scores :
// dérivés d'un hash de gameId + playerId, stables pour toute la partie
// (l'arbitre voit toujours "Joueur 3" à la même position en y revenant)
// mais différents d'une partie à l'autre — pour qu'il ne puisse pas
// mémoriser "telle colonne = tel joueur" sur la durée du tournoi et
// favoriser quelqu'un qu'il reconnaîtrait.
export function anonymizePlayersForGame<T extends { id: string }>(
  gameId: string,
  players: T[]
): AnonymizedPlayer<T>[] {
  return [...players]
    .sort((a, b) => hashString(`${gameId}:${a.id}`) - hashString(`${gameId}:${b.id}`))
    .map((player, i) => ({ player, label: `Joueur ${i + 1}` }));
}
