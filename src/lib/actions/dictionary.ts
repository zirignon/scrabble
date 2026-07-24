"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guards";
import { importDictionaryWords, clearDictionaryWords } from "@/lib/dictionary";

export async function importDictionaryAction(formData: FormData) {
  await requireRole(["ADMIN"]);

  const file = formData.get("file");
  const pasted = formData.get("text");

  let text = "";
  if (file instanceof File && file.size > 0) {
    text = await file.text();
  } else if (typeof pasted === "string") {
    text = pasted;
  }
  if (!text.trim()) return;

  await importDictionaryWords(text);

  revalidatePath("/admin/dictionnaire");
}

export async function clearDictionaryAction() {
  await requireRole(["ADMIN"]);
  await clearDictionaryWords();
  revalidatePath("/admin/dictionnaire");
}
