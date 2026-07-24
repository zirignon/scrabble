"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guards";
import { importDictionaryWords, clearDictionaryWords } from "@/lib/dictionary";

// Importe un bloc de mots (voir DictionaryImportForm) : le fichier ODS9 fait
// plusieurs Mo, largement au-delà de la limite de taille de requête d'une
// fonction serverless Vercel (4,5 Mo) — le fichier est donc découpé en petits
// blocs côté navigateur, chacun envoyé séparément via cette action.
export async function importDictionaryChunkAction(
  text: string
): Promise<{ imported: number; total: number }> {
  await requireRole(["ADMIN"]);
  return importDictionaryWords(text);
}

export async function clearDictionaryAction() {
  await requireRole(["ADMIN"]);
  await clearDictionaryWords();
  revalidatePath("/admin/dictionnaire");
}
