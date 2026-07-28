"use client";

import { useActionState } from "react";
import { createPlayerAction } from "@/lib/actions/players";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

export function PlayerForm({
  clubs,
}: {
  clubs: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    createPlayerAction,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="firstName" className="text-xs font-medium">
          Prénom
        </label>
        <input
          id="firstName"
          name="firstName"
          required
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="lastName" className="text-xs font-medium">
          Nom
        </label>
        <input
          id="lastName"
          name="lastName"
          required
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="clubId" className="text-xs font-medium">
          Club
        </label>
        <select
          id="clubId"
          name="clubId"
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
        >
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
        <input
          id="licenseNumber"
          name="licenseNumber"
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="category" className="text-xs font-medium">
          Catégorie
        </label>
        <input
          id="category"
          name="category"
          placeholder="Sénior, Junior..."
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
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
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm w-24"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="eloDuplicate" className="text-xs font-medium">
          Elo duplicate
        </label>
        <input
          id="eloDuplicate"
          name="eloDuplicate"
          type="number"
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm w-24"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="classificationClassic" className="text-xs font-medium">
          Série classique
        </label>
        <input
          id="classificationClassic"
          name="classificationClassic"
          placeholder="J, C, B, A..."
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm w-24"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="eloClassic" className="text-xs font-medium">
          Elo classique
        </label>
        <input
          id="eloClassic"
          name="eloClassic"
          type="number"
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm w-24"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="coefficientClassic" className="text-xs font-medium">
          Coeff. classique
        </label>
        <input
          id="coefficientClassic"
          name="coefficientClassic"
          type="number"
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm w-24"
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
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm w-20"
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
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm w-20"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "Ajout..." : "Ajouter"}
      </button>
      {state.error && <p className="text-sm text-red-600 w-full">{state.error}</p>}
    </form>
  );
}
