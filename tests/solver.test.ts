import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_SIZE } from "../src/lib/duplicate/board";
import { findWordSolutions } from "../src/lib/duplicate/solver";

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
