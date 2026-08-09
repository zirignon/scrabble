import assert from "node:assert/strict";
import test from "node:test";
import { generateRoundRobinRounds } from "../src/lib/classic/pairing";
import { generateSwissRound, seedFirstSwissRound } from "../src/lib/classic/swiss";
import {
  getKnockoutWinner,
  standardBracketSeeding,
} from "../src/lib/classic/knockout";

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
