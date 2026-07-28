"use client";

import { useEffect, useRef, useState } from "react";

interface PlayerResult {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string | null;
  clubName: string | null;
}

// Sélecteur d'inscription par recherche (nom ou n° de licence) plutôt qu'un
// <select> listant tous les joueurs — la base peut compter des dizaines de
// milliers d'entrées après un import fédéral.
export function PlayerSearchSelect({
  tournamentId,
  action,
}: {
  tournamentId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [selected, setSelected] = useState<PlayerResult | null>(null);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selected || query.trim().length < 2) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const params = new URLSearchParams({ q: query, tournamentId });
      const res = await fetch(`/api/joueurs/search?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setResults(data.players ?? []);
      setOpen(true);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tournamentId, selected]);

  return (
    <form action={action} className="flex items-end gap-3">
      <div className="flex flex-col gap-1 relative">
        <label htmlFor="player-search" className="text-xs font-medium">
          Ajouter un joueur (nom ou licence)
        </label>
        <input
          id="player-search"
          value={selected ? `${selected.lastName} ${selected.firstName}` : query}
          onChange={(e) => {
            setSelected(null);
            setQuery(e.target.value);
          }}
          onFocus={() => setOpen(results.length > 0)}
          autoComplete="off"
          placeholder="Tapez un nom ou un n° de licence..."
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm min-w-72"
        />
        <input type="hidden" name="playerId" value={selected?.id ?? ""} />
        {open && results.length > 0 && (
          <ul className="absolute top-full left-0 z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-black/10 dark:border-white/20 bg-white dark:bg-black shadow-lg">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(p);
                    setResults([]);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                >
                  {p.lastName} {p.firstName}
                  {p.licenseNumber && (
                    <span className="text-black/50 dark:text-white/50"> · {p.licenseNumber}</span>
                  )}
                  {p.clubName && (
                    <span className="text-black/50 dark:text-white/50"> · {p.clubName}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="submit"
        disabled={!selected}
        className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-40"
      >
        Inscrire
      </button>
    </form>
  );
}
