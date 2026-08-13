"use client";

import { useState, useTransition } from "react";

// Les actions de génération de rondes (round-robin, suisse, poules,
// élimination directe...) renvoient `{ error }` quand une précondition n'est
// pas remplie (équipes de tailles différentes, ronde en cours non terminée,
// etc) au lieu de lever une exception : Next.js redacte le message des
// erreurs qui traversent la frontière Server Action en production, donc
// seule une valeur de retour normale arrive intacte jusqu'ici. Le composant
// est appelé directement (plutôt que via la prop `action` du `<form>`),
// pour éviter en plus de faire planter toute la page sur l'écran d'erreur
// générique de Next.js si une erreur imprévue survenait malgré tout.
export function RoundActionButton({
  action,
  label,
  pendingLabel,
  className,
}: {
  action: () => Promise<{ error?: string } | void>;
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const result = await action();
              if (result?.error) setError(result.error);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Une erreur est survenue.");
            }
          });
        }}
        className={className}
      >
        {isPending ? pendingLabel ?? "…" : label}
      </button>
      {error && <p className="text-sm text-brick max-w-sm">{error}</p>}
    </div>
  );
}
