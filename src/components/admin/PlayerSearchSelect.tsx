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
        onMouseDown={(e) => e.preventDefault()}
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
    <div className="p-3 flex flex-col gap-2">
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
          onMouseDown={(e) => e.preventDefault()}
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
          onMouseDown={(e) => e.preventDefault()}
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
    // AbortController plutôt qu'un simple debounce : sur un réseau lent, une
    // requête déclenchée par une frappe plus ancienne peut répondre APRÈS
    // une requête plus récente et écraser des résultats à jour par des
    // résultats obsolètes — le contenu du menu (et donc la position du
    // bouton "+ Créer") change alors sous la souris juste avant le clic,
    // qui rate sa cible. On annule ici toute requête encore en vol dès que
    // la recherche change, pour qu'une seule réponse (la plus récente)
    // puisse jamais s'appliquer.
    const controller = new AbortController();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, tournamentId });
        if (context) params.set("context", context);
        const res = await fetch(`/api/joueurs/search?${params}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        setResults(data.players ?? []);
        setOpen(true);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") throw err;
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controller.abort();
    };
  }, [query, tournamentId, context, selected]);

  // Empêche le mousedown sur un élément du menu de retirer le focus du
  // champ de recherche avant que le clic ne soit traité — filet de
  // sécurité standard contre les menus qui se referment juste avant que le
  // clic n'arrive.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

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
          <div className="absolute top-full left-0 z-10 mt-1 w-full rounded-md border border-black/10 dark:border-white/20 bg-white dark:bg-black shadow-lg">
            {/* Le bouton "+ Créer" est affiché AVANT la liste de résultats (plutôt
                qu'après) pour que sa position reste stable pendant la frappe : le
                nombre de résultats change à chaque lettre tapée (jusqu'à 20 sur une
                base de dizaines de milliers de joueurs), et le placer après une
                liste de hauteur variable le faisait sauter de position sous la
                souris juste avant le clic. */}
            <CreatePlayerInline
              initialQuery={query}
              onCreated={(player) => {
                setSelected(player);
                setResults([]);
                setOpen(false);
              }}
            />
            <div className="max-h-64 overflow-y-auto border-t border-black/10 dark:border-white/20">
              {results.length > 0 && (
                <ul>
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onMouseDown={keepFocus}
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
            </div>
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
