// Génération des appariements round-robin (méthode du cercle / "circle method").
// Si le nombre de joueurs est impair, un joueur "BYE" (null) est ajouté pour chaque ronde.

export type Pairing = { home: string; away: string | null };

export function generateRoundRobinRounds(playerIds: string[]): Pairing[][] {
  const players: (string | null)[] = [...playerIds];
  if (players.length < 2) return [];
  if (players.length % 2 !== 0) players.push(null);

  const n = players.length;
  const fixed = players[0];
  const rotation = players.slice(1);
  const rounds: Pairing[][] = [];

  for (let r = 0; r < n - 1; r++) {
    const current = [fixed, ...rotation];
    const round: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const home = current[i];
      const away = current[n - 1 - i];
      if (home === null && away === null) continue;
      if (home === null) {
        round.push({ home: away as string, away: null });
      } else {
        round.push({ home, away });
      }
    }
    rounds.push(round);
    rotation.push(rotation.shift() as string | null);
  }

  return rounds;
}
