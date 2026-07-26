"use client";

import { useActionState, useState } from "react";
import { createTournamentAction } from "@/lib/actions/tournaments";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

export function TournamentForm() {
  const [state, formAction, pending] = useActionState(
    createTournamentAction,
    initialState
  );
  const [type, setType] = useState<"CLASSIC" | "DUPLICATE">("CLASSIC");
  const [isTeamEvent, setIsTeamEvent] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-xl">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          Nom du tournoi
        </label>
        <input
          id="name"
          name="name"
          required
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Mode de jeu</span>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="type"
              value="CLASSIC"
              checked={type === "CLASSIC"}
              onChange={() => setType("CLASSIC")}
            />
            Scrabble classique
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="type"
              value="DUPLICATE"
              checked={type === "DUPLICATE"}
              onChange={() => setType("DUPLICATE")}
            />
            Scrabble duplicate
          </label>
        </div>
      </div>

      {type === "CLASSIC" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="format" className="text-sm font-medium">
            Format
          </label>
          <select
            id="format"
            name="format"
            className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent"
            defaultValue="ROUND_ROBIN"
          >
            <option value="ROUND_ROBIN">Round-robin (chacun contre chacun)</option>
            <option value="SWISS">Système suisse</option>
            <option value="GROUPS">Poules</option>
            <option value="KNOCKOUT">Élimination directe</option>
          </select>
          {isTeamEvent && (
            <p className="text-xs text-black/60 dark:text-white/60">
              Seuls le round-robin et le système suisse génèrent
              automatiquement les rondes par équipes ; poules et élimination
              directe nécessitent un ajout manuel des rencontres.
            </p>
          )}
        </div>
      )}

      {type === "DUPLICATE" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="duplicateFormula" className="text-sm font-medium">
            Formule
          </label>
          <select
            id="duplicateFormula"
            name="duplicateFormula"
            className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent"
            defaultValue="NORMALE"
          >
            <option value="NORMALE">Partie normale</option>
            <option value="JOKER">Partie joker</option>
            <option value="SEPT_SUR_HUIT">Partie 7 sur 8</option>
            <option value="SEPT_SUR_HUIT_JOKER">Partie 7 sur 8 joker</option>
            <option value="SEPT_ET_HUIT">Partie 7 et 8</option>
            <option value="SEPT_ET_HUIT_JOKER">Partie 7 et 8 joker</option>
          </select>
          <p className="text-xs text-black/60 dark:text-white/60">
            Détermine les règles de jeu (tirage, primes de Scrabble). Pour
            7 et 8, prime de 75 pts à 8 lettres posées.
          </p>
        </div>
      )}

      {type === "DUPLICATE" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="duplicateRythme" className="text-sm font-medium">
            Rythme
          </label>
          <select
            id="duplicateRythme"
            name="duplicateRythme"
            className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent"
            defaultValue="NORMAL"
          >
            <option value="NORMAL">Normal (3 minutes)</option>
            <option value="SEMI_NORMAL">Semi-normal (2 minutes 30)</option>
            <option value="SEMI_RAPIDE">Semi-rapide (2 minutes)</option>
            <option value="SEMI_BLITZ">Semi-blitz (1 minute 30)</option>
            <option value="BLITZ">Blitz (1 minute)</option>
          </select>
          <p className="text-xs text-black/60 dark:text-white/60">
            Détermine la durée par défaut du chronomètre des parties.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isTeamEvent"
            checked={isTeamEvent}
            onChange={(e) => setIsTeamEvent(e.target.checked)}
          />
          Tournoi par équipes
        </label>
        {isTeamEvent && (
          <p className="text-xs text-black/60 dark:text-white/60">
            {type === "CLASSIC"
              ? "Un échiquier par joueur : les équipes s'affrontent selon le format choisi ci-dessus."
              : "Les scores individuels des membres de chaque équipe seront cumulés pour le classement par équipes."}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="startDate" className="text-sm font-medium">
            Date de début
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="endDate" className="text-sm font-medium">
            Date de fin (optionnel)
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="venue" className="text-sm font-medium">
          Lieu
        </label>
        <input
          id="venue"
          name="venue"
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-emerald-700 text-white px-4 py-2 font-medium disabled:opacity-60"
      >
        {pending ? "Création..." : "Créer le tournoi"}
      </button>
    </form>
  );
}
