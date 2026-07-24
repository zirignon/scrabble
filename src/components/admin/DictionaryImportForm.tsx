"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importDictionaryChunkAction } from "@/lib/actions/dictionary";

// Un fichier ODS9 complet fait plusieurs Mo en texte brut — bien au-delà de
// la limite de taille de requête des fonctions serverless Vercel (4,5 Mo).
// On le découpe donc en petits blocs de lignes, envoyés un par un.
const LINES_PER_CHUNK = 4000;

function splitIntoChunks(text: string, linesPerChunk: number): string[] {
  const lines = text.split(/\r?\n/);
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += linesPerChunk) {
    chunks.push(lines.slice(i, i + linesPerChunk).join("\n"));
  }
  return chunks;
}

export function DictionaryImportForm() {
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runImport(text: string) {
    if (!text.trim()) return;
    startTransition(async () => {
      const chunks = splitIntoChunks(text, LINES_PER_CHUNK);
      let imported = 0;
      let total = 0;
      for (let i = 0; i < chunks.length; i++) {
        setProgress(`Import en cours... bloc ${i + 1}/${chunks.length}`);
        const result = await importDictionaryChunkAction(chunks[i]);
        imported += result.imported;
        total = result.total;
      }
      setProgress(`Terminé : ${imported} nouveau(x) mot(s), ${total} au total.`);
      router.refresh();
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => runImport(String(reader.result ?? ""));
    reader.readAsText(file);
    e.target.value = "";
  }

  function handlePasteSubmit(formData: FormData) {
    runImport(String(formData.get("text") ?? ""));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="file" className="text-sm font-medium">
          Fichier texte (un mot par ligne)
        </label>
        <input
          id="file"
          type="file"
          accept=".txt,text/plain"
          onChange={handleFileChange}
          disabled={isPending}
          className="text-sm"
        />
      </div>

      <form action={handlePasteSubmit} className="flex flex-col gap-1">
        <label htmlFor="text" className="text-sm font-medium">
          ou coller une liste de mots
        </label>
        <textarea
          id="text"
          name="text"
          rows={6}
          placeholder={"MAISON\nJARDIN\nSCRABBLE..."}
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm font-mono"
        />
        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {isPending ? "Import..." : "Importer"}
        </button>
      </form>

      {progress && (
        <p className="text-sm text-black/70 dark:text-white/70">{progress}</p>
      )}
    </div>
  );
}
