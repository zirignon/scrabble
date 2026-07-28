"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

// Filtre la liste des joueurs au fil de la frappe (débattu), sans bouton à
// cliquer — la recherche déclenche un nouveau rendu serveur de la page via
// l'URL, comme les autres recherches de l'admin.
export function PlayerListSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (next.trim()) params.set("q", next.trim());
      router.push(`/admin/joueurs?${params.toString()}`);
    }, 300);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="q" className="text-xs font-medium">
        Rechercher (nom ou n° licence)
      </label>
      <input
        id="q"
        value={value}
        onChange={handleChange}
        autoComplete="off"
        className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm min-w-64"
      />
    </div>
  );
}
