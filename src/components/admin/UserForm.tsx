"use client";

import { useActionState } from "react";
import { createUserAction } from "@/lib/actions/users";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

const roleLabel: Record<string, string> = {
  ADMIN: "Administrateur",
  ORGANIZER: "Organisateur",
  REFEREE: "Arbitre",
  PLAYER: "Joueur",
};

export function UserForm() {
  const [state, formAction, pending] = useActionState(createUserAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-xs font-medium">
          Nom
        </label>
        <input
          id="name"
          name="name"
          required
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-xs font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-xs font-medium">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="text"
          required
          minLength={8}
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="role" className="text-xs font-medium">
          Rôle
        </label>
        <select
          id="role"
          name="role"
          defaultValue="ORGANIZER"
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
        >
          {Object.entries(roleLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "Création..." : "Créer le compte"}
      </button>
      {state.error && <p className="text-sm text-red-600 w-full">{state.error}</p>}
    </form>
  );
}
