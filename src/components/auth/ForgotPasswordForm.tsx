"use client";

import { useActionState } from "react";
import { requestPasswordResetAction, type ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  if (state.sent) {
    return (
      <p className="text-sm text-emerald-700 dark:text-emerald-400">
        Si un compte existe avec cet email, un lien de réinitialisation vient
        de lui être envoyé. Vérifiez votre boîte de réception (et vos
        indésirables).
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
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
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-700 text-white px-4 py-2 font-medium disabled:opacity-60"
      >
        {pending ? "Envoi..." : "Envoyer le lien"}
      </button>
    </form>
  );
}
