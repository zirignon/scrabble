import type { Pairing } from "@/lib/classic/pairing";

export interface KnockoutMatchLike {
  isBye: boolean;
  homePlayerId: string | null;
  awayPlayerId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

// Premier tour d'un tableau à élimination directe : complète l'effectif au
// prochain multiple de 2 avec des exempts (bye), qui avancent
// automatiquement sans jouer. Un joueur peut donc recevoir un bye si le
// nombre d'inscrits n'est pas une puissance de 2.
export function generateKnockoutFirstRound(playerIds: string[]): Pairing[] {
  const players: (string | null)[] = [...playerIds];
  let size = 1;
  while (size < players.length) size *= 2;
  while (players.length < size) players.push(null);

  const pairings: Pairing[] = [];
  for (let i = 0; i < players.length; i += 2) {
    const home = players[i];
    const away = players[i + 1];
    if (home === null && away === null) continue;
    if (home === null) pairings.push({ home: away as string, away: null });
    else pairings.push({ home, away });
  }
  return pairings;
}

// Détermine le vainqueur d'un match (ou null si le résultat n'est pas
// encore tranché : ronde à jouer, égalité non résolue, ou annulé sans
// vainqueur désigné).
export function getKnockoutWinner(match: KnockoutMatchLike): string | null {
  if (match.isBye) return match.homePlayerId;
  if (!match.homePlayerId || !match.awayPlayerId) return null;

  if (match.status === "PLAYED" && match.homeScore != null && match.awayScore != null) {
    if (match.homeScore > match.awayScore) return match.homePlayerId;
    if (match.homeScore < match.awayScore) return match.awayPlayerId;
    return null; // égalité : à résoudre manuellement (forfait, replay) avant de continuer
  }
  if (match.status === "FORFEIT_HOME") return match.awayPlayerId;
  if (match.status === "FORFEIT_AWAY") return match.homePlayerId;
  return null;
}

// Apparie les vainqueurs consécutifs du tour précédent pour former le tour
// suivant (vainqueur table 1 vs vainqueur table 2, etc.).
export function pairKnockoutWinners(winners: string[]): Pairing[] {
  const pairings: Pairing[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    const home = winners[i];
    const away = winners[i + 1];
    if (away === undefined) {
      pairings.push({ home, away: null });
    } else {
      pairings.push({ home, away });
    }
  }
  return pairings;
}
