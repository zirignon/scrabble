"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPlayerQuickAction } from "@/lib/actions/players";

interface PlayerResult {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string | null;
  clubName: string | null;
}

// Petit formulaire replié par défaut, pour créer un joueur qui n'existe pas
// encore en base sans quitter l'écran d'inscription — le champ recherche
// est repris tel quel comme point de départ (convention Nom Prénom du
// site), à corriger si besoin.
function CreatePlayerInline({
  initialQuery,
  onCreated,
}: {
  initialQuery: string;
  onCreated: (player: PlayerResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          const [first, ...rest] = initialQuery.trim().split(/\s+/);
          setLastName(first ?? "");
          setFirstName(rest.join(" "));
          setError(null);
          setOpen(true);
        }}
        className="w-full text-left px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400 hover:bg-black/[.04] dark:hover:bg-white/[.08]"
      >
        + Créer un nouveau joueur
      </button>
    );
  }

  return (
    <div className="p-3 flex flex-col gap-2 border-t border-black/10 dark:border-white/20">
      <p className="text-xs font-medium">Nouveau joueur</p>
      <div className="flex gap-2">
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Nom"
          className="flex-1 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
        />
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Prénom"
          className="flex-1 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
        />
      </div>
      <input
        value={licenseNumber}
        onChange={(e) => setLicenseNumber(e.target.value)}
        placeholder="N° de licence (optionnel)"
        className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
      />
      {error && <p className="text-xs text-brick">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending || !lastName.trim() || !firstName.trim()}
          onClick={() => {
            setError(null);
            const formData = new FormData();
            formData.set("lastName", lastName.trim());
            formData.set("firstName", firstName.trim());
            if (licenseNumber.trim()) formData.set("licenseNumber", licenseNumber.trim());
            startTransition(async () => {
              const result = await createPlayerQuickAction(formData);
              if (result.error || !result.playerId) {
                setError(result.error ?? "Une erreur est survenue.");
                return;
              }
              onCreated({
                id: result.playerId,
                lastName: lastName.trim(),
                firstName: firstName.trim(),
                licenseNumber: licenseNumber.trim() || null,
                clubName: null,
              });
              setOpen(false);
            });
          }}
          className="rounded bg-emerald-700 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          {isPending ? "Création…" : "Créer et sélectionner"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-black/10 dark:border-white/20 px-3 py-1.5 text-xs"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

// Sélecteur d'inscription par recherche (nom ou n° de licence) plutôt qu'un
// <select> listant tous les joueurs — la base peut compter des dizaines de
// milliers d'entrées après un import fédéral.
export function PlayerSearchSelect({
  tournamentId,
  action,
  context,
  label = "Ajouter un joueur (nom ou licence)",
  submitLabel = "Inscrire",
}: {
  tournamentId: string;
  action: (formData: FormData) => Promise<void>;
  // "team" : ajout direct d'un joueur à une équipe — n'exclut que les
  // joueurs déjà dans une équipe de ce tournoi (voir /api/joueurs/search),
  // l'inscription au tournoi se fait automatiquement à l'ajout.
  context?: "team";
  label?: string;
  submitLabel?: string;
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
      if (context) params.set("context", context);
      const res = await fetch(`/api/joueurs/search?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setResults(data.players ?? []);
      setOpen(true);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tournamentId, context, selected]);

  return (
    <form action={action} className="flex items-end gap-3">
      <div className="flex flex-col gap-1 relative">
        <label htmlFor="player-search" className="text-xs font-medium">
          {label}
        </label>
        <input
          id="player-search"
          value={selected ? `${selected.lastName} ${selected.firstName}` : query}
          onChange={(e) => {
            setSelected(null);
            setQuery(e.target.value);
          }}
          onFocus={() => setOpen(query.trim().length >= 2)}
          autoComplete="off"
          placeholder="Tapez un nom ou un n° de licence..."
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm min-w-72"
        />
        <input type="hidden" name="playerId" value={selected?.id ?? ""} />
        {open && !selected && query.trim().length >= 2 && (
          <div className="absolute top-full left-0 z-10 mt-1 w-full max-h-80 overflow-y-auto rounded-md border border-black/10 dark:border-white/20 bg-white dark:bg-black shadow-lg">
            {results.length > 0 && (
              <ul>
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
            {results.length === 0 && (
              <p className="px-3 py-2 text-sm text-black/50 dark:text-white/50">Aucun joueur trouvé.</p>
            )}
            <CreatePlayerInline
              initialQuery={query}
              onCreated={(player) => {
                setSelected(player);
                setResults([]);
                setOpen(false);
              }}
            />
          </div>
        )}
      </div>
      <button
        type="submit"
        disabled={!selected}
        className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </form>
  );
}
