// Cote Elo classique individuelle — formule fédérale reconstituée à partir
// d'un classeur d'analyse de cote réel (tournoi EFROUBA) et confirmée par
// l'utilisateur :
//
//   Evol cote = K × (W − We)
//
// K   = coefficient du joueur, fonction de son ancienneté/niveau (voir
//       nextClassicCoefficient) ;
// W   = performance réalisée sur CE match (0 défaite, 1 victoire, 0,5 nul) ;
// We  = probabilité de gain attendue, déterminée par l'écart entre les
//       cotes des deux joueurs AU DÉBUT DU TOURNOI (jamais recalculée en
//       cours de tournoi sur une cote déjà mise à jour — voir
//       Registration.eloAtStart/coeffAtStart).
//
// Ne s'applique qu'aux parties CLASSIQUES INDIVIDUELLES (jamais aux
// tournois par équipes ni duplicate) — voir applyClassicEloForMatch dans
// classic.ts pour l'intégration à la saisie des scores.

// Probabilité de gain attendue (We), formule Elo standard bornée à
// [0,08 ; 0,92] : même avec un très gros écart de niveau, jamais moins de
// 8% ni plus de 92% de chances attendues — même plafond que la table de
// correspondance cote→probabilité du classeur fédéral analysé. Arrondie au
// centième : cette table est elle-même précalculée à 2 décimales (0,45 —
// jamais 0,4455), et c'est cette valeur arrondie qui entre ensuite dans le
// calcul de l'évolution de cote, pas la valeur brute de la formule
// logistique — vérifié en reproduisant exactement 5 évolutions de cote
// réelles du classeur à partir des cotes et coefficients seuls.
export function expectedScore(ratingSelf: number, ratingOpponent: number): number {
  const raw = 1 / (1 + 10 ** (-(ratingSelf - ratingOpponent) / 400));
  return Math.round(Math.min(0.92, Math.max(0.08, raw)) * 100) / 100;
}

// Coefficient K par défaut pour un joueur sans coefficient enregistré
// (nouveau licencié, jamais importé) — le plus réactif, comme un joueur
// "provisoire".
export const DEFAULT_CLASSIC_COEFFICIENT = 40;

// Paliers de progression du coefficient K selon le nombre de parties
// individuelles classiques décidées jouées DANS L'APPLICATION (byes,
// tournois par équipes et duplicate exclus) — plus un joueur accumule de
// l'expérience, plus son K diminue et sa cote se stabilise, même principe
// que les règles de cote provisoire des fédérations d'échecs/Scrabble. Le
// classeur fédéral analysé n'expose pas les seuils exacts de sa propre
// fédération (le coefficient y est une donnée déjà déterminée en amont,
// pas recalculée par le classeur) : ceux ci-dessous sont un choix par
// défaut raisonnable, à ajuster si les règles réelles diffèrent.
const COEFFICIENT_THRESHOLDS: Array<{ minMatches: number; coefficient: number }> = [
  { minMatches: 100, coefficient: 10 },
  { minMatches: 50, coefficient: 16 },
  { minMatches: 20, coefficient: 20 },
];

// Ne fait jamais REMONTER le coefficient (Math.min avec l'existant) : un
// joueur importé avec un coefficient déjà bas (expérience acquise hors
// application, ex. import de la liste fédérale) ne doit pas se retrouver
// artificiellement remonté à 40 juste parce que son compteur de parties
// DANS L'APPLICATION repart de zéro.
export function nextClassicCoefficient(
  currentCoefficient: number | null,
  totalMatchesPlayed: number
): number {
  const current = currentCoefficient ?? DEFAULT_CLASSIC_COEFFICIENT;
  for (const tier of COEFFICIENT_THRESHOLDS) {
    if (totalMatchesPlayed >= tier.minMatches) {
      return Math.min(current, tier.coefficient);
    }
  }
  return current;
}

// Performance réalisée (W) à partir du statut et des scores d'un match —
// même barème victoire/nul/défaite que le classement par points de match
// (voir computeStandingsFromMatches), mais exprimé en 0,5/1/0 plutôt qu'en
// points. FORFEIT_BOTH et CANCELLED ne mesurent aucune performance réelle
// (personne n'a réellement joué l'un contre l'autre) : exclus du calcul de
// cote, contrairement au classement par points de match qui les compte
// (0 pt chacun) pour départager les classements.
export function classicEloResult(
  status: string,
  homeScore: number | null,
  awayScore: number | null
): { home: number; away: number } | null {
  if (status === "PLAYED") {
    if (homeScore == null || awayScore == null) return null;
    if (homeScore > awayScore) return { home: 1, away: 0 };
    if (homeScore < awayScore) return { home: 0, away: 1 };
    return { home: 0.5, away: 0.5 };
  }
  if (status === "FORFEIT_HOME") return { home: 0, away: 1 };
  if (status === "FORFEIT_AWAY") return { home: 1, away: 0 };
  return null;
}

// Evol cote = K × (W − We) — un seul côté à la fois (home ou away), voir
// classicEloResult pour W et expectedScore pour We.
export function classicEloDelta(coefficient: number, actual: number, expected: number): number {
  return coefficient * (actual - expected);
}
