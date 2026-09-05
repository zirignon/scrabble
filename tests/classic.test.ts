import assert from "node:assert/strict";
import test from "node:test";
import { generateRoundRobinRounds } from "../src/lib/classic/pairing";
import {
  generateSwissRound,
  generateSwissRoundWithForfeits,
  seedFirstSwissRound,
} from "../src/lib/classic/swiss";
import {
  crossSeedTwoPools,
  generateKnockoutFirstRound,
  getKnockoutWinner,
  standardBracketSeeding,
} from "../src/lib/classic/knockout";
import { computeStandingsFromMatches } from "../src/lib/classic/standings";
import { selectPoolQualifiers } from "../src/lib/classic/poolStandings";

test("round-robin crée une ronde par adversaire et un bye équitable", () => {
  const rounds = generateRoundRobinRounds(["a", "b", "c", "d", "e"]);
  assert.equal(rounds.length, 5);

  const matches = rounds.flat();
  assert.equal(matches.filter((match) => match.away === null).length, 5);
  const encounters = new Set(
    matches
      .filter((match) => match.away !== null)
      .map((match) => [match.home, match.away].sort().join(":"))
  );
  assert.equal(encounters.size, 10);
});

test("suisse évite une revanche lorsqu'un autre adversaire est disponible", () => {
  const pairings = generateSwissRound(
    [
      { playerId: "a", matchPoints: 3 },
      { playerId: "b", matchPoints: 3 },
      { playerId: "c", matchPoints: 2 },
      { playerId: "d", matchPoints: 2 },
    ],
    new Map([
      ["a", new Set(["b"])],
      ["b", new Set(["a"])],
    ]),
    new Set()
  );
  assert.deepEqual(pairings, [
    { home: "a", away: "c" },
    { home: "b", away: "d" },
  ]);
});

test("suisse attribue le bye au joueur le moins bien classé qui ne l'a pas déjà reçu", () => {
  const pairings = generateSwissRound(
    [
      { playerId: "a", matchPoints: 3 },
      { playerId: "b", matchPoints: 2 },
      { playerId: "c", matchPoints: 1 },
    ],
    new Map(),
    new Set(["c"])
  );
  assert.deepEqual(pairings.at(-1), { home: "b", away: null });
});

test("le seeding par classement place les entrants non classés en dernier", () => {
  const seeded = seedFirstSwissRound(
    [{ playerId: "a" }, { playerId: "b" }, { playerId: "c" }],
    "RATING",
    new Map([
      ["a", 1400],
      ["b", null],
      ["c", 1600],
    ])
  );
  assert.deepEqual(seeded.map((entry) => entry.playerId), ["c", "a", "b"]);
});

test("tableau éliminatoire protège les deux premières têtes de série jusqu'à la finale", () => {
  assert.deepEqual(standardBracketSeeding(["1", "2", "3", "4", "5", "6", "7", "8"]), [
    { home: "1", away: "8" },
    { home: "4", away: "5" },
    { home: "2", away: "7" },
    { home: "3", away: "6" },
  ]);
});

test("tirage au sort saigné : les têtes de série les mieux classées reçoivent l'exempt avec un effectif hors puissance de 2", () => {
  const pairings = standardBracketSeeding(["1", "2", "3", "4", "5"]);
  // Complété à 8 (prochaine puissance de 2) : les 3 têtes de série les
  // mieux classées (1, 2, 3) reçoivent un exempt, seules 4 et 5 s'affrontent
  // réellement au 1er tour.
  assert.deepEqual(pairings, [
    { home: "1", away: null },
    { home: "4", away: "5" },
    { home: "2", away: null },
    { home: "3", away: null },
  ]);
});

test("premier tour à élimination directe : un effectif hors puissance de 2 ne perd ni ne double aucun entrant", () => {
  const pairings = generateKnockoutFirstRound(["a", "b", "c", "d", "e"]);
  const byes = pairings.filter((p) => p.away === null);
  assert.equal(byes.length, 1);
  const allEntrants = pairings.flatMap((p) => [p.home, p.away]).filter((id): id is string => id !== null);
  assert.deepEqual(allEntrants.sort(), ["a", "b", "c", "d", "e"]);
});

test("appariement en croix de 2 poules impaires : les deux qualifiés du rang médian s'affrontent entre eux", () => {
  const pairings = crossSeedTwoPools(["A1", "A2", "A3"], ["B1", "B2", "B3"]);
  assert.deepEqual(pairings, [
    { home: "A1", away: "B3" },
    { home: "B1", away: "A3" },
    { home: "A2", away: "B2" },
  ]);
});

test("un match nul ne désigne pas de vainqueur en élimination directe", () => {
  assert.equal(
    getKnockoutWinner({
      isBye: false,
      homePlayerId: "a",
      awayPlayerId: "b",
      homeScore: 10,
      awayScore: 10,
      status: "PLAYED",
    }),
    null
  );
});

test("les forfaits de la ronde précédente s'affrontent entre eux en bas du classement", () => {
  const pairings = generateSwissRoundWithForfeits(
    [
      { playerId: "a", matchPoints: 9 },
      { playerId: "b", matchPoints: 6 },
      { playerId: "c", matchPoints: 3 },
      { playerId: "d", matchPoints: 0 },
      { playerId: "e", matchPoints: 0 },
      { playerId: "f", matchPoints: 0 },
    ],
    new Map(),
    new Set(),
    new Set(["d", "e", "f"])
  );
  // d, e, f étaient forfait : deux d'entre eux s'affrontent, le troisième
  // (nombre impair) affronte le dernier joueur présent au classement (c),
  // et les présents restants (a, b) sont appariés normalement.
  assert.deepEqual(pairings.find((p) => p.home === "a" || p.away === "a"), {
    home: "a",
    away: "b",
  });
  const forfeitVsForfeit = pairings.find(
    (p) => ["d", "e", "f"].includes(p.home) && ["d", "e", "f"].includes(p.away ?? "")
  );
  assert.ok(forfeitVsForfeit, "deux forfaits doivent s'affronter entre eux");
  const forfeitVsLastPresent = pairings.find(
    (p) => p.home === "c" || p.away === "c"
  );
  assert.ok(forfeitVsLastPresent, "le forfait restant doit affronter le dernier présent (c)");
  assert.ok(
    ["d", "e", "f"].includes(forfeitVsLastPresent!.home) ||
      ["d", "e", "f"].includes(forfeitVsLastPresent!.away ?? ""),
    "le dernier présent doit affronter un forfait, pas un autre présent"
  );
});

test("sans forfait à la ronde précédente, l'appariement reste inchangé", () => {
  const standings = [
    { playerId: "a", matchPoints: 3 },
    { playerId: "b", matchPoints: 3 },
    { playerId: "c", matchPoints: 0 },
    { playerId: "d", matchPoints: 0 },
  ];
  assert.deepEqual(
    generateSwissRoundWithForfeits(standings, new Map(), new Set(), new Set()),
    generateSwissRound(standings, new Map(), new Set())
  );
});

test("barème de points : victoire 3, nul 2, défaite jouée 1, forfait 0", () => {
  const players = [
    { playerId: "a", firstName: "A", lastName: "A" },
    { playerId: "b", firstName: "B", lastName: "B" },
    { playerId: "c", firstName: "C", lastName: "C" },
    { playerId: "d", firstName: "D", lastName: "D" },
  ];
  const rows = computeStandingsFromMatches(players, [
    // a bat b (victoire/défaite jouée)
    {
      isBye: false,
      homePlayerId: "a",
      awayPlayerId: "b",
      homeScore: 400,
      awayScore: 350,
      status: "PLAYED",
      roundNumber: 1,
    },
    // c et d font match nul
    {
      isBye: false,
      homePlayerId: "c",
      awayPlayerId: "d",
      homeScore: 300,
      awayScore: 300,
      status: "PLAYED",
      roundNumber: 1,
    },
    // ronde 2 : a forfait face à c (score 0 côté a)
    {
      isBye: false,
      homePlayerId: "a",
      awayPlayerId: "c",
      homeScore: 0,
      awayScore: 400,
      status: "FORFEIT_HOME",
      roundNumber: 2,
    },
  ]);
  const byId = new Map(rows.map((r) => [r.playerId, r]));

  assert.equal(byId.get("b")!.matchPoints, 1); // défaite jouée
  assert.equal(byId.get("b")!.forfeits, 0);
  assert.equal(byId.get("c")!.matchPoints, 2 + 3); // nul (2) + victoire par forfait (3)
  assert.equal(byId.get("d")!.matchPoints, 2); // nul
  assert.equal(byId.get("a")!.matchPoints, 3 + 0); // victoire (3) + forfait (0)
  assert.equal(byId.get("a")!.forfeits, 1);
  assert.equal(byId.get("a")!.losses, 1);
});

test("un double forfait (0-0) donne 0 point aux deux camps, pas un nul", () => {
  const players = [
    { playerId: "a", firstName: "A", lastName: "A" },
    { playerId: "b", firstName: "B", lastName: "B" },
  ];
  const rows = computeStandingsFromMatches(players, [
    {
      isBye: false,
      homePlayerId: "a",
      awayPlayerId: "b",
      homeScore: 0,
      awayScore: 0,
      status: "FORFEIT_BOTH",
      roundNumber: 1,
    },
  ]);
  const byId = new Map(rows.map((r) => [r.playerId, r]));
  assert.equal(byId.get("a")!.matchPoints, 0);
  assert.equal(byId.get("a")!.forfeits, 1);
  assert.equal(byId.get("a")!.losses, 1);
  assert.equal(byId.get("b")!.matchPoints, 0);
  assert.equal(byId.get("b")!.forfeits, 1);
});

test("sélection des qualifiés de poules : un nombre impair de poules à 1 qualifié chacune donne un total impair", () => {
  const pools = [
    { standings: [{ playerId: "a1" }, { playerId: "a2" }] },
    { standings: [{ playerId: "b1" }, { playerId: "b2" }] },
    { standings: [{ playerId: "c1" }, { playerId: "c2" }] },
  ];
  const qualifiers = selectPoolQualifiers(pools, 1, "playerId");
  assert.deepEqual(qualifiers, ["a1", "b1", "c1"]);
});

test("sélection des qualifiés de poules : une poule plus petite que le nombre de qualifiés demandé ne casse rien", () => {
  const pools = [
    { standings: [{ playerId: "a1" }] },
    { standings: [{ playerId: "b1" }, { playerId: "b2" }] },
  ];
  // La poule A n'a qu'un seul membre : son 2e rang n'existe pas et est
  // simplement ignoré, sans introduire d'id manquant (undefined) ni casser
  // la génération du tour suivant.
  const qualifiers = selectPoolQualifiers(pools, 2, "playerId");
  assert.deepEqual(qualifiers, ["a1", "b1", "b2"]);
});

test("phase suisse d'un tournoi Combiné : un nombre impair de qualifiés de poules reçoit un seul exempt, sans perte de joueur", () => {
  // Reproduit bout à bout le chemin réel de generateSwissPhaseRoundActionImpl :
  // 3 poules qualifiant chacune leur 1er (total impair de 3), directement
  // appariés pour la 1re ronde suisse.
  const pools = [
    { standings: [{ playerId: "a1" }, { playerId: "a2" }] },
    { standings: [{ playerId: "b1" }, { playerId: "b2" }] },
    { standings: [{ playerId: "c1" }, { playerId: "c2" }] },
  ];
  const qualifierIds = selectPoolQualifiers(pools, 1, "playerId");
  assert.equal(qualifierIds.length, 3);

  const pairings = generateSwissRound(
    qualifierIds.map((playerId) => ({ playerId, matchPoints: 0 })),
    new Map(),
    new Set()
  );
  const byes = pairings.filter((p) => p.away === null);
  assert.equal(byes.length, 1);
  const allEntrants = pairings.flatMap((p) => [p.home, p.away]).filter((id): id is string => id !== null);
  assert.deepEqual(allEntrants.sort(), qualifierIds.sort());
});
