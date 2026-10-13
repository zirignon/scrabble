import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_SIZE } from "../src/lib/duplicate/board";
import { findWordSolutions, validatePlayerWord } from "../src/lib/duplicate/solver";

function emptyBoard(): (string | null)[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

// Dictionnaire synthétique : tous les mots de 2 lettres distinctes
// composables à partir du tirage "AEISTNR" (7 lettres distinctes, aucune
// en double) — 7×6 = 42 combinaisons, toutes jouables sur une grille
// vide puisqu'elle ne contraint aucune lettre fixe.
function twoLetterDictionary(letters: string): Set<string> {
  const words = new Set<string>();
  for (const a of letters) {
    for (const b of letters) {
      if (a !== b) words.add(a + b);
    }
  }
  return words;
}

// findWordSolutions doit renvoyer la totalité des solutions trouvées par
// défaut (pas seulement les 30 meilleures comme avant) : le plafond n'est
// appliqué que si `limit` est explicitement fourni.
test("findWordSolutions : renvoie toutes les solutions sans limite par défaut", () => {
  const rack = "AEISTNR";
  const dictionary = twoLetterDictionary(rack);
  const solutions = findWordSolutions(emptyBoard(), rack, dictionary, []);
  assert.ok(
    solutions.length > 30,
    `attendu plus de 30 solutions (dictionnaire synthétique de ${dictionary.size} mots), obtenu ${solutions.length}`
  );
  // Chaque solution doit effectivement être un mot du dictionnaire fourni.
  for (const s of solutions) {
    assert.ok(dictionary.has(s.word.toUpperCase()), `"${s.word}" doit appartenir au dictionnaire`);
  }
});

test("findWordSolutions : respecte une limite explicite si elle est fournie", () => {
  const rack = "AEISTNR";
  const dictionary = twoLetterDictionary(rack);
  const solutions = findWordSolutions(emptyBoard(), rack, dictionary, [], 5);
  assert.equal(solutions.length, 5);
});

test("findWordSolutions : triées par score décroissant, limite ou non", () => {
  const rack = "AEISTNR";
  const dictionary = twoLetterDictionary(rack);
  const solutions = findWordSolutions(emptyBoard(), rack, dictionary, []);
  for (let i = 1; i < solutions.length; i++) {
    assert.ok(solutions[i - 1].score >= solutions[i].score, "le tri par score décroissant doit être respecté");
  }
});

test("findWordSolutions : grille vide sans dictionnaire compatible renvoie un tableau vide", () => {
  const solutions = findWordSolutions(emptyBoard(), "AEISTNR", new Set(["ZZZZZZZ"]), []);
  assert.deepEqual(solutions, []);
});

// validatePlayerWord vérifie un coup déjà choisi par un joueur (pas une
// recherche) : dictionnaire, cohérence avec la grille déjà posée, règle du
// centre/du recoupement, et suffisance du tirage — avant de calculer le
// score via la même logique que le coup de référence (computeMoveScore).
test("validatePlayerWord : mot valide sur grille vide, passant par le centre", () => {
  const result = validatePlayerWord(emptyBoard(), "CAT", 8, 8, "ACROSS", "CAT", new Set(["CAT"]), []);
  // C=3, A=1, T=1 → 5, ×2 (case centrale DW) = 10.
  assert.deepEqual(result, { valid: true, score: 10, reason: null });
});

test("validatePlayerWord : mot absent du dictionnaire", () => {
  const result = validatePlayerWord(emptyBoard(), "CAT", 8, 8, "ACROSS", "CAT", new Set(["CHAT"]), []);
  assert.equal(result.valid, false);
  assert.equal(result.score, null);
  assert.match(result.reason ?? "", /dictionnaire/i);
});

test("validatePlayerWord : lettre en conflit avec une case déjà posée", () => {
  const board = emptyBoard();
  board[7][7] = "C";
  board[7][8] = "A";
  board[7][9] = "T";
  const result = validatePlayerWord(board, "R", 8, 8, "ACROSS", "CAR", new Set(["CAR"]), []);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /contient déjà la lettre "T"/);
});

test("validatePlayerWord : ne touche ni la grille existante ni le centre", () => {
  const board = emptyBoard();
  board[7][7] = "C";
  board[7][8] = "A";
  board[7][9] = "T";
  const result = validatePlayerWord(board, "DOG", 1, 1, "ACROSS", "DOG", new Set(["DOG"]), []);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /toucher une lettre déjà posée/);
});

test("validatePlayerWord : tirage insuffisant (lettre manquante)", () => {
  const result = validatePlayerWord(emptyBoard(), "CA", 8, 8, "ACROSS", "CAT", new Set(["CAT"]), []);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /"T"/);
});

test("validatePlayerWord : joker correctement utilisé (lettre minuscule), vaut 0 point", () => {
  const result = validatePlayerWord(emptyBoard(), "CA?", 8, 8, "ACROSS", "CAt", new Set(["CAT"]), []);
  // C=3, A=1, joker(t)=0 → 4, ×2 (case centrale DW) = 8.
  assert.deepEqual(result, { valid: true, score: 8, reason: null });
});

test("validatePlayerWord : un joker ne peut pas être utilisé s'il n'y en a pas dans le tirage", () => {
  const result = validatePlayerWord(emptyBoard(), "CA", 8, 8, "ACROSS", "CAt", new Set(["CAT"]), []);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /joker/i);
});

test("validatePlayerWord : une grille vide exige de passer par la case centrale", () => {
  const result = validatePlayerWord(emptyBoard(), "DOG", 1, 1, "ACROSS", "DOG", new Set(["DOG"]), []);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /case centrale/);
});

test("validatePlayerWord : mot qui ne pose aucune lettre nouvelle est rejeté", () => {
  const board = emptyBoard();
  board[7][7] = "C";
  board[7][8] = "A";
  board[7][9] = "T";
  const result = validatePlayerWord(board, "CAT", 8, 8, "ACROSS", "CAT", new Set(["CAT"]), []);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /aucune lettre nouvelle/);
});

test("validatePlayerWord : mot hors grille", () => {
  const result = validatePlayerWord(emptyBoard(), "ABCDEFGHIJKLMNO", 8, 10, "ACROSS", "ABCDEFGHIJKLMNO", new Set(["ABCDEFGHIJKLMNO"]), []);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /dépasse la grille/);
});
