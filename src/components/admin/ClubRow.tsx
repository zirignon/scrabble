"use client";

import { useActionState } from "react";
import { updateClubAction, deleteClubAction } from "@/lib/actions/clubs";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

const inputClass =
  "rounded-md border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm";

export function ClubRow({
  club,
}: {
  club: {
    id: string;
    name: string;
    code: string | null;
    city: string | null;
    federation: string | null;
    playerCount: number;
  };
}) {
  const [state, formAction, pending] = useActionState(
    updateClubAction.bind(null, club.id),
    initialState
  );

  return (
    <tr className="border-b border-black/5 dark:border-white/5 align-top">
      <td className="py-2 pr-4">
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input name="name" defaultValue={club.name} required className={`${inputClass} w-40`} />
          <input
            name="city"
            defaultValue={club.city ?? ""}
            placeholder="Ville"
            className={`${inputClass} w-28`}
          />
          <input
            name="federation"
            defaultValue={club.federation ?? ""}
            placeholder="Fédération"
            className={`${inputClass} w-24`}
          />
          {club.code && (
            <span
              className="text-xs text-black/40 dark:text-white/40"
              title="Code d'import fédéral"
            >
              code : {club.code}
            </span>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-emerald-700 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-60"
          >
            {pending ? "..." : "Enregistrer"}
          </button>
          {state.error && <p className="text-xs text-red-600 basis-full">{state.error}</p>}
        </form>
      </td>
      <td className="py-2 pr-4">{club.playerCount}</td>
      <td className="py-2 pr-4 text-right">
        <form action={deleteClubAction.bind(null, club.id)}>
          <button type="submit" className="text-red-600 hover:underline text-sm">
            Supprimer
          </button>
        </form>
      </td>
    </tr>
  );
}
