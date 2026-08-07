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

// Appariement en croix pour la phase finale générée depuis exactement 2
// poules (A et B), qui garde les deux têtes de poule dans des moitiés de
// tableau séparées (elles ne peuvent donc se rencontrer qu'en finale) :
//   QF1 = 1erA vs derB, QF2 = 2eA vs avant-dernier B, ...  (moitié A)
//   QF3 = 1erB vs derA, QF4 = 2eB vs avant-dernier A, ...  (moitié B)
// Si le nombre de qualifiés par poule est impair, les deux qualifiés du
// rang médian (non départagés par le tirage en croix) se rencontrent entre
// eux en dernier appariement.
export function crossSeedTwoPools(poolA: string[], poolB: string[]): Pairing[] {
  const n = Math.min(poolA.length, poolB.length);
  const half = Math.floor(n / 2);
  const pairings: Pairing[] = [];
  for (let k = 0; k < half; k++) {
    pairings.push({ home: poolA[k], away: poolB[n - 1 - k] });
  }
  for (let k = 0; k < half; k++) {
    pairings.push({ home: poolB[k], away: poolA[n - 1 - k] });
  }
  if (n % 2 === 1) {
    pairings.push({ home: poolA[half], away: poolB[half] });
  }
  return pairings;
}

// Ordre de tirage au sort standard d'un tableau à élimination directe pour
// un classement unique (une seule poule, ou classement général) : place
// récursivement le seed n+1-k en face du seed k, de sorte que les deux
// premiers du classement ne puissent se rencontrer qu'en finale, les 4
// premiers qu'à partir des demi-finales, etc (méthode utilisée par la
// plupart des tirages au sort sportifs). Pour 8 qualifiés, donne l'ordre
// 1,8,4,5,2,7,3,6, soit les quarts 1-8, 4-5, 2-7, 3-6.
function bracketSeedOrder(size: number): number[] {
  if (size === 1) return [1];
  const prev = bracketSeedOrder(size / 2);
  const order: number[] = [];
  for (const seed of prev) {
    order.push(seed, size + 1 - seed);
  }
  return order;
}

// Appariement du 1er tour à partir d'un classement unique déjà trié (1er en
// tête), via le tirage au sort standard ci-dessus. Complète au prochain
// multiple de 2 avec des exempts (bye) pour les moins bien classés, comme
// generateKnockoutFirstRound.
export function standardBracketSeeding(rankedIds: string[]): Pairing[] {
  const ids: (string | null)[] = [...rankedIds];
  let size = 1;
  while (size < ids.length) size *= 2;
  while (ids.length < size) ids.push(null);

  const seeded = bracketSeedOrder(size).map((seedNumber) => ids[seedNumber - 1]);

  const pairings: Pairing[] = [];
  for (let i = 0; i < seeded.length; i += 2) {
    const home = seeded[i];
    const away = seeded[i + 1];
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

export interface TeamEncounterBoardLike {
  status: string;
  homeScore: number | null;
  awayScore: number | null;
}

// Résultat d'une confrontation d'équipes (majorité d'échiquiers gagnés,
// comme pour la progression du tableau à élimination directe) à partir de
// ses échiquiers — null tant qu'un échiquier reste à jouer. Réutilisé par
// les pages rondes (admin et publique) pour afficher le vainqueur dès que
// la confrontation est terminée, sans attendre que l'arbitre le calcule à
// la main.
export function getTeamEncounterResult(
  boards: TeamEncounterBoardLike[]
): { homeBoardsWon: number; awayBoardsWon: number } | null {
  if (boards.length === 0 || boards.some((b) => b.status === "SCHEDULED")) return null;
  let homeBoardsWon = 0;
  let awayBoardsWon = 0;
  for (const b of boards) {
    if (b.status === "PLAYED" && b.homeScore != null && b.awayScore != null) {
      if (b.homeScore > b.awayScore) homeBoardsWon += 1;
      else if (b.homeScore < b.awayScore) awayBoardsWon += 1;
    } else if (b.status === "FORFEIT_HOME") {
      awayBoardsWon += 1;
    } else if (b.status === "FORFEIT_AWAY") {
      homeBoardsWon += 1;
    }
    // CANCELLED : échiquier non comptabilisé.
  }
  return { homeBoardsWon, awayBoardsWon };
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

export interface KnockoutRoundMatchLike {
  isBye: boolean;
  homePlayerId?: string | null;
  awayPlayerId?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
}

// Compte les entrants (joueurs ou équipes) d'un tour à élimination directe
// à partir de ses matchs — en équipes, plusieurs lignes Match partagent la
// même confrontation (une par échiquier), d'où la déduplication par paire.
export function countKnockoutEntrants(matches: KnockoutRoundMatchLike[]): number {
  const seen = new Set<string>();
  let entrants = 0;
  for (const m of matches) {
    const home = m.homeTeamId ?? m.homePlayerId ?? null;
    const away = m.awayTeamId ?? m.awayPlayerId ?? null;
    const key = m.isBye ? `bye:${home}` : `${home}:${away}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entrants += m.isBye ? 1 : 2;
  }
  return entrants;
}

// Nom du tour selon le nombre d'entrants, à la manière des tableaux
// officiels : Finale, Demi-finales, Quarts de finale, Huitièmes de
// finale...
export function getKnockoutStageLabel(entrants: number): string {
  if (entrants <= 2) return "Finale";
  if (entrants <= 4) return "Demi-finales";
  if (entrants <= 8) return "Quarts de finale";
  if (entrants <= 16) return "Huitièmes de finale";
  if (entrants <= 32) return "Seizièmes de finale";
  if (entrants <= 64) return "Trente-deuxièmes de finale";
  return `Tour de ${entrants}`;
}
