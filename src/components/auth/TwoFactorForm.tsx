"use client";

import { useActionState } from "react";
import {
  cancelTwoFactorAction,
  resendTwoFactorCodeAction,
  verifyTwoFactorAction,
  type ActionState,
} from "@/lib/actions/auth";

const initialState: ActionState = {};

export function TwoFactorForm() {
  const [state, formAction, pending] = useActionState(verifyTwoFactorAction, initialState);
  const [resendState, resendAction, resendPending] = useActionState(
    resendTwoFactorCodeAction,
    initialState
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="code" className="text-sm font-medium">
            Code de vérification
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            required
            autoFocus
            className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-center text-lg tracking-[0.3em]"
          />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-700 text-white px-4 py-2 font-medium disabled:opacity-60"
        >
          {pending ? "Vérification..." : "Valider"}
        </button>
      </form>

      <form action={resendAction} className="flex flex-col gap-2">
        {resendState.sent && (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            Un nouveau code a été envoyé.
          </p>
        )}
        {resendState.error && <p className="text-sm text-red-600">{resendState.error}</p>}
        <button
          type="submit"
          disabled={resendPending}
          className="self-start text-sm text-black/60 dark:text-white/60 hover:underline disabled:opacity-60"
        >
          {resendPending ? "Envoi..." : "Renvoyer le code"}
        </button>
      </form>

      <form action={cancelTwoFactorAction}>
        <button
          type="submit"
          className="text-sm text-black/50 dark:text-white/50 hover:underline"
        >
          Annuler et retourner à la connexion
        </button>
      </form>
    </div>
  );
}
