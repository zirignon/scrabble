import { prisma } from "@/lib/prisma";

// Forme "jouable" d'un mot : majuscules, sans accents ni ponctuation — les
// tuiles de Scrabble ne portent pas d'accent (un É se joue avec un E).
export function normalizeWord(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

export async function countDictionaryWords(): Promise<number> {
  return prisma.dictionaryWord.count();
}

// Renvoie null si le dictionnaire n'a pas été importé (rien à vérifier),
// sinon si le mot y figure.
export async function isValidWord(word: string): Promise<boolean | null> {
  const normalized = normalizeWord(word);
  if (!normalized) return null;

  const total = await prisma.dictionaryWord.count();
  if (total === 0) return null;

  const found = await prisma.dictionaryWord.findUnique({ where: { word: normalized } });
  return found !== null;
}

export async function importDictionaryWords(
  text: string
): Promise<{ imported: number; total: number }> {
  const words = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const normalized = normalizeWord(line);
    if (normalized) words.add(normalized);
  }

  const result = await prisma.dictionaryWord.createMany({
    data: [...words].map((word) => ({ word })),
    skipDuplicates: true,
  });

  const total = await countDictionaryWords();
  return { imported: result.count, total };
}

export async function clearDictionaryWords(): Promise<void> {
  await prisma.dictionaryWord.deleteMany();
}
