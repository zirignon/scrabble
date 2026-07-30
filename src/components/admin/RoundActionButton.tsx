"use client";

import { useState, useTransition } from "react";

// Les actions de génération de rondes (round-robin, suisse, poules,
// élimination directe...) lèvent une erreur explicite quand une précondition
// n'est pas remplie (équipes de tailles différentes, ronde en cours non
// terminée, etc). Appelées directement (plutôt que via la prop `action` du
// `<form>`), l'erreur est capturable ici et affichée proprement au lieu de
// faire planter toute la page sur l'écran d'erreur générique de Next.js.
export function RoundActionButton({
  action,
  label,
  pendingLabel,
  className,
}: {
  action: () => Promise<void>;
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
              await action();
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
