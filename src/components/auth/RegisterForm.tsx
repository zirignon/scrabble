"use client";

import { useActionState } from "react";
import { registerAction, type ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          Nom complet
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent"
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-700 text-white px-4 py-2 font-medium disabled:opacity-60"
      >
        {pending ? "Création..." : "Créer mon compte"}
      </button>
    </form>
  );
}
