"use client";

import { useFormStatus } from "react-dom";

// Enregistre automatiquement le score dès que l'organisateur quitte le champ
// (Tab, clic ailleurs) ou appuie sur Entrée, au lieu d'exiger un clic sur un
// bouton "OK" séparé. requestSubmit() déclenche la même soumission de
// formulaire (donc la même Server Action recordMatchResultAction) que
// l'ancien bouton — aucun changement côté serveur.
export function AutoSubmitScoreInput({
  name,
  defaultValue,
  className,
}: {
  name: string;
  defaultValue: number | string;
  className?: string;
}) {
  return (
    <input
      type="number"
      name={name}
      defaultValue={defaultValue}
      className={className}
      onBlur={(e) => {
        e.currentTarget.form?.requestSubmit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          // Empêche la soumission native immédiate (avant que le champ
          // n'ait perdu le focus) : on déclenche le blur, qui se charge lui
          // même de l'enregistrement ci-dessus, pour un seul chemin commun.
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

// Voir le commentaire équivalent ci-dessus : enregistre dès le changement de
// statut plutôt qu'au clic sur "OK".
export function AutoSubmitStatusSelect({
  formId,
  defaultValue,
  className,
  children,
}: {
  formId: string;
  defaultValue: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <select
      form={formId}
      name="status"
      defaultValue={defaultValue}
      className={className}
      onChange={(e) => {
        e.currentTarget.form?.requestSubmit();
      }}
    >
      {children}
    </select>
  );
}

// Petit indicateur affiché pendant l'enregistrement automatique du score,
// pour remplacer le retour visuel qu'offrait le clic sur "OK". useFormStatus
// lit l'état de soumission via le contexte React (pas l'attribut HTML
// form=), donc ce composant doit être un enfant JSX du <form> lui-même —
// placé aux côtés des champs de score plutôt que du statut, qui en est
// séparé (voir MatchRow/LegScoreCell).
export function SavingIndicator() {
  const { pending } = useFormStatus();
  return (
    <span
      aria-hidden={!pending}
      className={`text-xs text-emerald-700 dark:text-emerald-400 transition-opacity ${
        pending ? "opacity-100" : "opacity-0"
      }`}
    >
      …
    </span>
  );
}
