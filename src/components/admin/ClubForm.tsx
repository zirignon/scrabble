"use client";

import { useActionState } from "react";
import { createClubAction } from "@/lib/actions/clubs";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

export function ClubForm() {
  const [state, formAction, pending] = useActionState(createClubAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-xs font-medium">
          Nom du club
        </label>
        <input
          id="name"
          name="name"
          required
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="city" className="text-xs font-medium">
          Ville
        </label>
        <input
          id="city"
          name="city"
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="federation" className="text-xs font-medium">
          Fédération
        </label>
        <input
          id="federation"
          name="federation"
          placeholder="FFSc, FQSC..."
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
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
