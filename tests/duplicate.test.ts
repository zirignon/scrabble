import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  applyResolvedJokers,
  computeAvailableLetters,
  computeLastReliquat,
  computeRemainingLetters,
  countStuckJokers,
  formatReliquat,
  isGameOver,
  isJokerFormula,
  reconstructBoard,
  BOARD_SIZE,
  FRENCH_LETTER_DISTRIBUTION,
  type BoardCell,
} from "../src/lib/duplicate/board";

// isJokerFormula est pure : seules les 3 formules "joker" (voir le
// commentaire sur getBingoRules) déclenchent la résolution automatique
// d'un joker posé sur la grille (validateGameRackAction).
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

// computeRemainingLetters sert à décider, dans validateGameRackAction, si
// un joker peut être résolu automatiquement (règlement FISF) : il ne doit
// décompter qu'une seule fois chaque lettre réellement tirée, jamais le
// reliquat reporté d'un tour à l'autre.
test("computeRemainingLetters : décompte les lettres nouvellement tirées, sans doublon sur le reliquat reporté", () => {
  const moves = [
    // Tirage "AB" : seul le A est joué, le B reste en reliquat.
    { turnNumber: 1, row: 1, col: 1, direction: "ACROSS", word: "A", isPass: false, rack: "AB" },
    // Tirage complet annoncé au tour 2 = reliquat "B" + nouvelles "CD" ;
    // le B ne doit pas être décompté une seconde fois ici.
    { turnNumber: 2, row: 3, col: 1, direction: "ACROSS", word: "BCD", isPass: false, rack: "BCD" },
  ];
  const remaining = computeRemainingLetters(moves, []);
  assert.equal(remaining.A, FRENCH_LETTER_DISTRIBUTION.A - 1);
  assert.equal(remaining.B, FRENCH_LETTER_DISTRIBUTION.B - 1, "le B ne doit être décompté qu'une fois");
  assert.equal(remaining.C, FRENCH_LETTER_DISTRIBUTION.C - 1);
  assert.equal(remaining.D, FRENCH_LETTER_DISTRIBUTION.D - 1);
  assert.equal(remaining.E, FRENCH_LETTER_DISTRIBUTION.E, "une lettre jamais tirée reste à son compte plein");
});

test("computeRemainingLetters : un joker résolu consomme en plus un exemplaire de la lettre représentée", () => {
  const moves = [
    { turnNumber: 1, row: 8, col: 8, direction: "ACROSS", word: "RaT", isPass: false, rack: "RT?" },
  ];
  // Le tirage "RT?" ne contient aucun "A" réel : seule la résolution du
  // joker (ci-dessous) doit décompter un A.
  const remainingBefore = computeRemainingLetters(moves, []);
  assert.equal(remainingBefore.A, FRENCH_LETTER_DISTRIBUTION.A);

  const remainingAfter = computeRemainingLetters(moves, [{ row: 8, col: 9 }]);
  assert.equal(remainingAfter.A, FRENCH_LETTER_DISTRIBUTION.A - 1);
  assert.equal(remainingAfter.R, FRENCH_LETTER_DISTRIBUTION.R - 1);
  assert.equal(remainingAfter.T, FRENCH_LETTER_DISTRIBUTION.T - 1);
});

test("computeRemainingLetters : une lettre entièrement tirée tombe à 0 (jamais sous 0 via la résolution d'un joker inexistant)", () => {
  // Un seul coup qui épuise d'un coup les 15 "E" de la distribution (cas
  // artificiel, pour vérifier que le compteur peut atteindre 0 et que
  // c'est bien ce que la résolution automatique consulte pour décider).
  const moves = [
    {
      turnNumber: 1,
      row: 5,
      col: 1,
      direction: "ACROSS",
      word: "EEEEEEEEEEEEEEE",
      isPass: false,
      rack: "EEEEEEEEEEEEEEE",
    },
  ];
  const remaining = computeRemainingLetters(moves, []);
  assert.equal(remaining.E, 0, "les 15 E de la distribution sont épuisés");
});

test("computeRemainingLetters : un tirage sans rack enregistré ne fait pas planter le suivi", () => {
  const moves = [
    { turnNumber: 1, row: 1, col: 1, direction: "ACROSS", word: "A", isPass: false, rack: null },
    { turnNumber: 2, row: 3, col: 1, direction: "ACROSS", word: "B", isPass: false, rack: "B" },
  ];
  assert.doesNotThrow(() => computeRemainingLetters(moves, []));
  const remaining = computeRemainingLetters(moves, []);
  assert.equal(remaining.B, FRENCH_LETTER_DISTRIBUTION.B - 1);
});

// isGameOver : la partie se termine lorsqu'il n'y a plus aucune voyelle ou
// plus aucune consonne disponible pour les tirages à venir, reliquat en
// main compris (pas seulement le sac) — voir le commentaire sur
// isGameOver. Les 45 voyelles de la distribution (A9 E15 I8 O6 U6 Y1)
// sont épuisées ici en 3 coups de 15 lettres chacun (la limite de la
// grille), sans dictionnaire ni recoupement à respecter puisque
// computeRemainingLetters ne regarde que rack/word, pas la validité.
test("isGameOver : une partie qui débute n'est jamais terminée", () => {
  assert.equal(isGameOver([], []), false);
});

test("isGameOver : les voyelles épuisées dans le sac mais pas dans le reliquat ne terminent pas la partie", () => {
  const moves = [
    {
      turnNumber: 1,
      row: 1,
      col: 1,
      direction: "ACROSS",
      word: "AAAAAAAAAEEEEEE",
      isPass: false,
      rack: "AAAAAAAAAEEEEEE",
    },
    {
      turnNumber: 2,
      row: 2,
      col: 1,
      direction: "ACROSS",
      word: "EEEEEEEEEIIIIII",
      isPass: false,
      rack: "EEEEEEEEEIIIIII",
    },
    // Dernier coup : tire les 15 dernières voyelles (I I O×6 U×6 Y) mais
    // n'en joue que 14, laissant le Y en reliquat (non joué).
    {
      turnNumber: 3,
      row: 3,
      col: 1,
      direction: "ACROSS",
      word: "IIOOOOOOUUUUUU",
      isPass: false,
      rack: "IIOOOOOOUUUUUUY",
    },
  ];
  const remaining = computeRemainingLetters(moves, []);
  assert.equal(
    Object.entries(remaining)
      .filter(([letter]) => "AEIOUY".includes(letter))
      .reduce((sum, [, count]) => sum + Math.max(0, count), 0),
    0,
    "le sac ne doit plus contenir aucune voyelle"
  );
  assert.equal(
    isGameOver(moves, []),
    false,
    "le Y restant dans le reliquat (non joué) doit encore compter comme disponible"
  );
});

// computeAvailableLetters est la fusion sac + reliquat que réutilise
// isGameOver (voir ci-dessus) et la ligne de statut du sac affichée à
// l'arbitre : un Y laissé en reliquat (non joué) doit être recompté, pas
// seulement rester dans le compte brut du sac.
test("computeAvailableLetters : recompte dans le reliquat le Y laissé non joué", () => {
  const moves = [
    { turnNumber: 1, row: 8, col: 1, direction: "ACROSS", word: "RT", isPass: false, rack: "RTY" },
  ];
  const sacSeul = computeRemainingLetters(moves, []);
  const avecReliquat = computeAvailableLetters(moves, []);
  assert.equal(sacSeul.Y, FRENCH_LETTER_DISTRIBUTION.Y - 1, "le Y a été tiré (il est dans le reliquat, pas dans le sac)");
  assert.equal(
    avecReliquat.Y,
    FRENCH_LETTER_DISTRIBUTION.Y,
    "le Y non joué, resté en reliquat, est recompté comme disponible"
  );
});

// countStuckJokers : un joker non résolu dont la lettre représentée est
// encore disponible n'a pas vocation à rester compté comme "bloqué"
// (l'automatisme de validateGameRackAction l'aurait déjà résolu), mais le
// calcul ne fait que compter les cases non résolues, sans vérifier cette
// invariante lui-même — ce test porte seulement sur le comptage brut.
test("countStuckJokers : compte les cases jokers non résolues, ignore les résolues", () => {
  const moves = [
    { turnNumber: 1, row: 8, col: 8, direction: "ACROSS", word: "RaT", isPass: false },
    { turnNumber: 2, row: 9, col: 8, direction: "ACROSS", word: "kA", isPass: false },
  ];
  assert.equal(countStuckJokers(moves, []), 2, "les deux jokers posés ne sont pas résolus");
  assert.equal(
    countStuckJokers(moves, [{ row: 8, col: 9 }]),
    1,
    "un seul des deux jokers est résolu"
  );
});

test("isGameOver : voyelles épuisées sac + reliquat termine la partie", () => {
  const moves = [
    {
      turnNumber: 1,
      row: 1,
      col: 1,
      direction: "ACROSS",
      word: "AAAAAAAAAEEEEEE",
      isPass: false,
      rack: "AAAAAAAAAEEEEEE",
    },
    {
      turnNumber: 2,
      row: 2,
      col: 1,
      direction: "ACROSS",
      word: "EEEEEEEEEIIIIII",
      isPass: false,
      rack: "EEEEEEEEEIIIIII",
    },
    // Cette fois les 15 lettres tirées sont aussi les 15 lettres jouées :
    // plus aucune voyelle nulle part, ni dans le sac ni en reliquat.
    {
      turnNumber: 3,
      row: 3,
      col: 1,
      direction: "ACROSS",
      word: "IIOOOOOOUUUUUUY",
      isPass: false,
      rack: "IIOOOOOOUUUUUUY",
    },
  ];
  assert.equal(isGameOver(moves, []), true);
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

// Vérifie le mécanisme de résolution d'un joker (reproduit directement ici
// en base l'insertion ResolvedJoker que validateGameRackAction effectue
// automatiquement — la Server Action elle-même n'étant pas invocable hors
// requête Next.js, voir la note équivalente dans tests/permissions.test.ts) :
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

      // Résolution (reproduit l'insertion ResolvedJoker de validateGameRackAction).
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

// Règlement FISF : un joker joué est remplacé par la lettre qu'il
// représentait dès le tirage du tour suivant, SI cette lettre est encore
// dans le sac. Reproduit ici (hors requireRole, voir la note sur le test
// précédent) exactement la boucle de résolution automatique *gated* de
// validateGameRackAction (src/lib/actions/duplicate.ts), qui consulte
// computeRemainingLetters avant de résoudre chaque joker non résolu.
test(
  "validation du tirage suivant : résout un joker si sa lettre est disponible, pas si elle est épuisée",
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
        email: `dup-org2-${Date.now()}@test.local`,
        name: "Organisateur",
        role: "ORGANIZER",
        passwordHash: "x",
      },
    });
    const tournament = await prisma.tournament.create({
      data: {
        name: "Partie joker auto-résolution test",
        slug: `partie-joker-auto-resolution-test-${Date.now()}`,
        type: "DUPLICATE",
        duplicateFormula: "JOKER",
        organizerId: organizer.id,
        startDate: new Date(),
      },
    });
    const game = await prisma.game.create({
      data: { tournamentId: tournament.id, number: 1 },
    });
    // Coup 1 : "KAT" (K, A, T réels, aucun joker) — épuise le seul K de la
    // distribution (FRENCH_LETTER_DISTRIBUTION.K === 1).
    await prisma.referenceMove.create({
      data: {
        gameId: game.id,
        turnNumber: 1,
        row: 8,
        col: 8,
        direction: "ACROSS",
        word: "KAT",
        rack: "KAT",
        points: 4,
      },
    });
    // Coup 2 : un joker isolé représentant K (lettre déjà épuisée).
    await prisma.referenceMove.create({
      data: {
        gameId: game.id,
        turnNumber: 2,
        row: 10,
        col: 5,
        direction: "ACROSS",
        word: "k",
        rack: "?",
        points: 0,
      },
    });
    // Coup 3 : un joker isolé représentant A (abondant, 9 dans la
    // distribution, un seul tiré jusqu'ici).
    await prisma.referenceMove.create({
      data: {
        gameId: game.id,
        turnNumber: 3,
        row: 12,
        col: 3,
        direction: "ACROSS",
        word: "a",
        rack: "?",
        points: 0,
      },
    });

    try {
      // Reproduit la boucle *gated* de validateGameRackAction.
      const moves = await prisma.referenceMove.findMany({ where: { gameId: game.id } });
      const board = reconstructBoard(moves);
      const alreadyResolved = new Set(
        (await prisma.resolvedJoker.findMany({ where: { gameId: game.id } })).map(
          (r) => `${r.row}-${r.col}`
        )
      );
      const unresolvedCells: { row: number; col: number; letter: string }[] = [];
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const cell = board[r][c];
          if (cell?.isBlank && !alreadyResolved.has(`${r + 1}-${c + 1}`)) {
            unresolvedCells.push({ row: r + 1, col: c + 1, letter: cell.letter });
          }
        }
      }
      assert.equal(unresolvedCells.length, 2, "les jokers K et A, tous deux non résolus");

      const remaining = computeRemainingLetters(moves, []);
      assert.equal(remaining.K, 0, "le seul K de la distribution a déjà été tiré au coup 1");
      assert.ok(remaining.A > 0, "il reste des A dans la distribution");

      const toResolve: { gameId: string; row: number; col: number }[] = [];
      for (const cell of unresolvedCells) {
        if ((remaining[cell.letter] ?? 0) > 0) {
          toResolve.push({ gameId: game.id, row: cell.row, col: cell.col });
          remaining[cell.letter] -= 1;
        }
      }
      assert.equal(toResolve.length, 1, "seul le joker A doit être résolu, pas le K épuisé");
      assert.deepEqual(
        { row: toResolve[0].row, col: toResolve[0].col },
        { row: 12, col: 3 }
      );
      await prisma.resolvedJoker.createMany({ data: toResolve, skipDuplicates: true });

      const resolvedRows = await prisma.resolvedJoker.findMany({ where: { gameId: game.id } });
      assert.equal(resolvedRows.length, 1);

      const movesAfter = await prisma.referenceMove.findMany({
        where: { gameId: game.id },
        orderBy: { turnNumber: "asc" },
      });
      assert.equal(
        movesAfter[0].points,
        4,
        "le score du coup déjà enregistré ne doit jamais changer"
      );
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
