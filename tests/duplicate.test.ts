import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  applyResolvedJokers,
  computeLastReliquat,
  formatReliquat,
  isJokerFormula,
  reconstructBoard,
  type BoardCell,
} from "../src/lib/duplicate/board";

// isJokerFormula est pure : seules les 3 formules "joker" (voir le
// commentaire sur getBingoRules) autorisent la résolution d'un joker posé
// sur la grille (resolveJokerAction).
test("isJokerFormula : seules les formules joker renvoient true", () => {
  assert.equal(isJokerFormula("JOKER"), true);
  assert.equal(isJokerFormula("SEPT_SUR_HUIT_JOKER"), true);
  assert.equal(isJokerFormula("SEPT_ET_HUIT_JOKER"), true);
  assert.equal(isJokerFormula("NORMALE"), false);
  assert.equal(isJokerFormula("SEPT_SUR_HUIT"), false);
  assert.equal(isJokerFormula("SEPT_ET_HUIT"), false);
  assert.equal(isJokerFormula(null), false);
  assert.equal(isJokerFormula(undefined), false);
});

// applyResolvedJokers ne doit toucher que les cases listées, sans muter la
// grille d'origine (reconstructBoard reste la source de vérité rejouée à
// chaque rendu) ni changer la lettre affichée (seul isBlank change).
// Règlement FISF : un joker accompagne systématiquement le tirage de chaque
// tour en formule joker, tant qu'il en reste un en jeu — le reliquat
// suggéré doit donc toujours inclure un "?" en formule joker, même quand
// le joker du tour précédent a été joué (cas vérifié ici : le coup
// "WEBeR" consomme son joker, mais le reliquat suggéré pour le tour
// suivant en propose quand même un nouveau). Reproduit l'exemple fourni :
// tirage "WEBHUR?" (W,E,B,H,U,R + un joker), coup "WEBeR" en H4 (le "e"
// minuscule représentant le second E, absent du tirage), reliquat attendu
// "HU?+" (H et U non joués, triés, suivis du joker puis du "+").
test("formatReliquat : ajoute automatiquement un \"?\" en formule joker même si celui joué a été utilisé", () => {
  const playedLetters = [
    { letter: "W", isBlank: false },
    { letter: "E", isBlank: false },
    { letter: "B", isBlank: false },
    { letter: "E", isBlank: true },
    { letter: "R", isBlank: false },
  ];
  assert.equal(formatReliquat("WEBHUR?", playedLetters, "JOKER"), "HU?+");
  // Hors formule joker, pas de "?" ajouté : comportement inchangé.
  assert.equal(formatReliquat("WEBHUR?", playedLetters, "NORMALE"), "HU+");
  assert.equal(formatReliquat("WEBHUR?", playedLetters), "HU+");
});

test("formatReliquat : n'ajoute pas de second \"?\" si un joker reste déjà non joué", () => {
  assert.equal(formatReliquat("AB?", [{ letter: "A", isBlank: false }], "SEPT_SUR_HUIT_JOKER"), "B?+");
});

test("formatReliquat : tirage entièrement joué renvoie quand même \"?+\" en formule joker", () => {
  assert.equal(
    formatReliquat("AB", [
      { letter: "A", isBlank: false },
      { letter: "B", isBlank: false },
    ], "JOKER"),
    "?+"
  );
  // Hors formule joker, un tirage entièrement joué renvoie bien null (inchangé).
  assert.equal(
    formatReliquat("AB", [
      { letter: "A", isBlank: false },
      { letter: "B", isBlank: false },
    ]),
    null
  );
});

test("computeLastReliquat : propage la formule jusqu'au dernier coup joué", () => {
  // Tirage "RT?" entièrement joué par "RaT" (R, T réels, "a" minuscule =
  // joker représentant le A) : rien ne reste, mais en formule joker un "?"
  // est quand même suggéré pour le tour suivant.
  const moves = [
    { turnNumber: 1, row: 8, col: 8, direction: "ACROSS", word: "RaT", isPass: false, rack: "RT?" },
  ];
  assert.equal(computeLastReliquat(moves, "JOKER"), "?+");
  assert.equal(computeLastReliquat(moves), null);
});

test("applyResolvedJokers : ne lève le statut blanc que des cases résolues, sans muter l'original", () => {
  const moves = [
    { turnNumber: 1, row: 8, col: 8, direction: "ACROSS", word: "RaT", isPass: false },
  ];
  const original = reconstructBoard(moves);
  assert.equal(original[7][8]?.isBlank, true, "le 'A' en minuscule doit être un joker");

  const resolved = applyResolvedJokers(original, [{ row: 8, col: 9 }]);

  // L'original n'est pas muté.
  assert.equal(original[7][8]?.isBlank, true);
  // La case résolue (8,9 = ligne 8, colonne 9, 0-indexé [7][8]) n'est plus blanche.
  assert.equal(resolved[7][8]?.isBlank, false);
  assert.equal(resolved[7][8]?.letter, "A", "la lettre affichée ne change jamais");
  // Les cases voisines non listées comme résolues restent inchangées.
  assert.equal(resolved[7][7]?.isBlank, false, "le 'r' n'a jamais été un joker");
  assert.equal(resolved[7][9]?.isBlank, false, "le 'T' n'a jamais été un joker");
});

test("applyResolvedJokers : tableau vide renvoie la grille telle quelle (no-op)", () => {
  const moves = [
    { turnNumber: 1, row: 8, col: 8, direction: "ACROSS", word: "RaT", isPass: false },
  ];
  const board = reconstructBoard(moves);
  const result = applyResolvedJokers(board, []);
  assert.equal(result, board);
});

test("applyResolvedJokers : une case hors grille ou vide ne provoque pas d'erreur", () => {
  const board: (BoardCell | null)[][] = reconstructBoard([]);
  assert.doesNotThrow(() => applyResolvedJokers(board, [{ row: 1, col: 1 }, { row: 99, col: 99 }]));
});

const prisma = new PrismaClient();

// Vérifie le flux complet de resolveJokerAction (reproduit directement ici
// en base, la Server Action elle-même n'étant pas invocable hors requête
// Next.js — voir la note équivalente dans tests/permissions.test.ts) :
// résoudre un joker crée bien la ligne ResolvedJoker, l'affichage de la
// grille (reconstructBoard + applyResolvedJokers) la montre alors comme
// une lettre normale, et le score déjà enregistré du coup de référence
// (ReferenceMove.points) n'est jamais modifié par cette opération — c'est
// tout l'intérêt de ResolvedJoker comme table séparée plutôt que de
// corriger directement ReferenceMove.word (qui, lui, déclenche un
// recalcul complet des scores, voir recomputeReferenceMoveScores).
// Nécessite une base accessible (DATABASE_URL) ; absente en CI, ce test
// s'y désactive donc automatiquement (t.skip).
test(
  "résolution d'un joker : grille mise à jour, score du coup inchangé",
  async (t) => {
    const dbAvailable = await prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);
    if (!dbAvailable) {
      t.skip("base de données indisponible (attendu en CI)");
      return;
    }

    const organizer = await prisma.user.create({
      data: {
        email: `dup-org-${Date.now()}@test.local`,
        name: "Organisateur",
        role: "ORGANIZER",
        passwordHash: "x",
      },
    });
    const tournament = await prisma.tournament.create({
      data: {
        name: "Partie joker test",
        slug: `partie-joker-test-${Date.now()}`,
        type: "DUPLICATE",
        duplicateFormula: "JOKER",
        organizerId: organizer.id,
        startDate: new Date(),
      },
    });
    const game = await prisma.game.create({
      data: { tournamentId: tournament.id, number: 1 },
    });
    const move = await prisma.referenceMove.create({
      data: {
        gameId: game.id,
        turnNumber: 1,
        row: 8,
        col: 8,
        direction: "ACROSS",
        word: "RaT",
        points: 4,
      },
    });

    try {
      const beforeMoves = await prisma.referenceMove.findMany({ where: { gameId: game.id } });
      const boardBefore = reconstructBoard(beforeMoves);
      assert.equal(boardBefore[7][8]?.isBlank, true);

      // Résolution (reproduit resolveJokerAction, sans la couche requireRole).
      await prisma.resolvedJoker.upsert({
        where: { gameId_row_col: { gameId: game.id, row: 8, col: 9 } },
        update: {},
        create: { gameId: game.id, row: 8, col: 9 },
      });

      const resolvedRows = await prisma.resolvedJoker.findMany({ where: { gameId: game.id } });
      const afterMoves = await prisma.referenceMove.findMany({ where: { gameId: game.id } });
      const boardAfter = applyResolvedJokers(reconstructBoard(afterMoves), resolvedRows);

      assert.equal(boardAfter[7][8]?.isBlank, false, "la grille affiche désormais une lettre normale");
      assert.equal(
        afterMoves.find((m) => m.id === move.id)?.points,
        4,
        "le score du coup déjà enregistré ne doit jamais changer"
      );

      // Idempotent : résoudre deux fois ne crée pas de doublon.
      await prisma.resolvedJoker.upsert({
        where: { gameId_row_col: { gameId: game.id, row: 8, col: 9 } },
        update: {},
        create: { gameId: game.id, row: 8, col: 9 },
      });
      assert.equal(await prisma.resolvedJoker.count({ where: { gameId: game.id } }), 1);
    } finally {
      await prisma.resolvedJoker.deleteMany({ where: { gameId: game.id } });
      await prisma.referenceMove.deleteMany({ where: { gameId: game.id } });
      await prisma.game.deleteMany({ where: { id: game.id } });
      await prisma.tournament.deleteMany({ where: { id: tournament.id } });
      await prisma.user.deleteMany({ where: { id: organizer.id } });
      await prisma.$disconnect();
    }
  }
);
