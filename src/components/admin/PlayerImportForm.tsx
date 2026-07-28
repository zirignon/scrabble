"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importPlayersChunkAction } from "@/lib/actions/players";

// Le fichier fédéral peut compter des dizaines de milliers de lignes — bien
// au-delà de la limite de taille de requête des fonctions serverless Vercel
// (4,5 Mo). On le découpe donc en blocs de lignes, envoyés un par un (même
// principe que l'import du dictionnaire).
const LINES_PER_CHUNK = 2000;

function splitIntoChunks(text: string, linesPerChunk: number): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += linesPerChunk) {
    chunks.push(lines.slice(i, i + linesPerChunk).join("\n"));
  }
  return chunks;
}

export function PlayerImportForm() {
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      if (!text.trim()) return;
      startTransition(async () => {
        setErrors([]);
        const chunks = splitIntoChunks(text, LINES_PER_CHUNK);
        let created = 0;
        let updated = 0;
        let clubsCreated = 0;
        const allErrors: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
          setProgress(`Import en cours... bloc ${i + 1}/${chunks.length}`);
          const result = await importPlayersChunkAction(chunks[i]);
          created += result.created;
          updated += result.updated;
          clubsCreated += result.clubsCreated;
          allErrors.push(...result.errors);
        }
        setProgress(
          `Terminé : ${created} joueur(s) créé(s), ${updated} mis à jour, ${clubsCreated} club(s) créé(s).`
        );
        setErrors(allErrors);
        router.refresh();
      });
    };
    // Les fichiers fédéraux sont généralement encodés en ISO-8859-1.
    reader.readAsText(file, "ISO-8859-1");
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="players-csv" className="text-sm font-medium">
        Importer des joueurs (CSV fédéral)
      </label>
      <p className="text-xs text-black/60 dark:text-white/60">
        Colonnes attendues, sans en-tête : Nom;Prénoms;Licence;Elo duplicate;
        Série duplicate;Club;Catégorie;Nationalité;Fédération;Elo classique;
        Série classique;Coefficient classique. Les joueurs déjà présents
        (même n° de licence) sont mis à jour.
      </p>
      <input
        id="players-csv"
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChange}
        disabled={isPending}
        className="text-sm"
      />
      {progress && (
        <p className="text-sm text-black/70 dark:text-white/70">{progress}</p>
      )}
      {errors.length > 0 && (
        <details className="text-sm text-red-600">
          <summary>{errors.length} erreur(s)</summary>
          <ul className="list-disc list-inside">
            {errors.slice(0, 50).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
