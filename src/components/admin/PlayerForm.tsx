"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { savePlayerAction } from "@/lib/actions/players";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

interface PlayerMatch {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string | null;
  clubId: string | null;
  clubName: string | null;
  category: string | null;
  classification: string | null;
  classificationClassic: string | null;
  coefficientClassic: number | null;
  eloDuplicate: number | null;
  eloClassic: number | null;
  nationality: string | null;
  federation: string | null;
}

const inputClass =
  "rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm";

export function PlayerForm({
  clubs,
}: {
  clubs: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(savePlayerAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playerId, setPlayerId] = useState("");
  const [suggestions, setSuggestions] = useState<PlayerMatch[]>([]);
  const [open, setOpen] = useState(false);

  // Une fois la soumission terminée sans erreur, on repart d'un formulaire
  // vierge (création d'un nouveau joueur par défaut).
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      formRef.current?.reset();
      setPlayerId("");
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  function setFieldValue(name: string, value: string) {
    const el = formRef.current?.elements.namedItem(name);
    if (el && "value" in el) (el as unknown as { value: string }).value = value;
  }

  function triggerSearch() {
    const firstName = (formRef.current?.elements.namedItem("firstName") as HTMLInputElement)?.value ?? "";
    const lastName = (formRef.current?.elements.namedItem("lastName") as HTMLInputElement)?.value ?? "";
    const query = `${lastName} ${firstName}`.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/joueurs/search?${new URLSearchParams({ q: query })}`);
      if (!res.ok) return;
      const data = await res.json();
      setSuggestions(data.players ?? []);
      setOpen(true);
    }, 250);
  }

  function selectSuggestion(p: PlayerMatch) {
    setPlayerId(p.id);
    setFieldValue("firstName", p.firstName);
    setFieldValue("lastName", p.lastName);
    setFieldValue("clubId", p.clubId ?? "");
    setFieldValue("licenseNumber", p.licenseNumber ?? "");
    setFieldValue("category", p.category ?? "");
    setFieldValue("classification", p.classification ?? "");
    setFieldValue("classificationClassic", p.classificationClassic ?? "");
    setFieldValue("coefficientClassic", p.coefficientClassic != null ? String(p.coefficientClassic) : "");
    setFieldValue("eloDuplicate", p.eloDuplicate != null ? String(p.eloDuplicate) : "");
    setFieldValue("eloClassic", p.eloClassic != null ? String(p.eloClassic) : "");
    setFieldValue("nationality", p.nationality ?? "");
    setFieldValue("federation", p.federation ?? "");
    setSuggestions([]);
    setOpen(false);
  }

  function resetToNew() {
    formRef.current?.reset();
    setPlayerId("");
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      {playerId && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Joueur existant sélectionné — l&apos;enregistrement mettra à jour sa fiche.{" "}
          <button type="button" onClick={resetToNew} className="underline">
            Créer un nouveau joueur à la place
          </button>
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="playerId" value={playerId} />
        <div className="flex flex-col gap-1">
          <label htmlFor="firstName" className="text-xs font-medium">
            Prénom
          </label>
          <input
            id="firstName"
            name="firstName"
            required
            autoComplete="off"
            onChange={triggerSearch}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1 relative">
          <label htmlFor="lastName" className="text-xs font-medium">
            Nom
          </label>
          <input
            id="lastName"
            name="lastName"
            required
            autoComplete="off"
            onChange={triggerSearch}
            onFocus={() => setOpen(suggestions.length > 0)}
            className={inputClass}
          />
          {open && suggestions.length > 0 && (
            <ul className="absolute top-full left-0 z-10 mt-1 w-72 max-h-64 overflow-y-auto rounded-md border border-black/10 dark:border-white/20 bg-white dark:bg-black shadow-lg">
              {suggestions.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => selectSuggestion(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                  >
                    {p.firstName} {p.lastName}
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
        <div className="flex flex-col gap-1">
          <label htmlFor="clubId" className="text-xs font-medium">
            Club
          </label>
          <select id="clubId" name="clubId" className={inputClass}>
            <option value="">—</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="licenseNumber" className="text-xs font-medium">
            N° licence
          </label>
          <input id="licenseNumber" name="licenseNumber" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-xs font-medium">
            Catégorie
          </label>
          <input
            id="category"
            name="category"
            placeholder="Sénior, Junior..."
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="classification" className="text-xs font-medium">
            Série duplicate
          </label>
          <input
            id="classification"
            name="classification"
            placeholder="1A, 2B, 7..."
            className={`${inputClass} w-24`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="eloDuplicate" className="text-xs font-medium">
            Elo duplicate
          </label>
          <input id="eloDuplicate" name="eloDuplicate" type="number" className={`${inputClass} w-24`} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="classificationClassic" className="text-xs font-medium">
            Série classique
          </label>
          <input
            id="classificationClassic"
            name="classificationClassic"
            placeholder="J, C, B, A..."
            className={`${inputClass} w-24`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="eloClassic" className="text-xs font-medium">
            Elo classique
          </label>
          <input id="eloClassic" name="eloClassic" type="number" className={`${inputClass} w-24`} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="coefficientClassic" className="text-xs font-medium">
            Coeff. classique
          </label>
          <input
            id="coefficientClassic"
            name="coefficientClassic"
            type="number"
            className={`${inputClass} w-24`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="nationality" className="text-xs font-medium">
            Nationalité
          </label>
          <input
            id="nationality"
            name="nationality"
            placeholder="CI, FR..."
            className={`${inputClass} w-20`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="federation" className="text-xs font-medium">
            Fédération
          </label>
          <input
            id="federation"
            name="federation"
            placeholder="FR, QC..."
            className={`${inputClass} w-20`}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Enregistrement..." : playerId ? "Mettre à jour" : "Ajouter"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
