"use client";

import { useFormStatus } from "react-dom";

// Un élément associé à un <form> (input/select/button/textarea), qu'il soit
// imbriqué dans le DOM ou simplement rattaché via l'attribut form= — les
// deux cas se rencontrent ici (voir MatchRow où le statut vit dans une
// cellule séparée, contrairement à LegScoreCell). La propriété .form reflète
// toujours le formulaire logique, peu importe la position dans le DOM.
function isSameForm(target: EventTarget | null, form: HTMLFormElement | null): boolean {
  if (!form || !target) return false;
  return (target as { form?: HTMLFormElement | null }).form === form;
}

// Enregistre automatiquement le score dès que l'organisateur quitte tout le
// groupe de saisie (score + statut, même si tabuler entre les champs) — pas
// à chaque changement de focus interne, sinon tabuler du score domicile vers
// le score extérieur déclenche un enregistrement (avec l'ancien score
// extérieur) dont le rafraîchissement de page peut retomber en pleine
// frappe du nouveau score extérieur et en effacer les premiers chiffres.
// Voir isSameForm ci-dessus : le prochain élément focalisé (relatedTarget)
// est comparé par formulaire logique, pas par position DOM. Remplace le
// clic sur un bouton "OK" séparé ; requestSubmit() déclenche la même
// soumission (donc la même Server Action recordMatchResultAction) que
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
        const form = e.currentTarget.form;
        if (!isSameForm(e.relatedTarget, form)) {
          form?.requestSubmit();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          // Empêche la soumission native immédiate (avant que le champ
          // n'ait perdu le focus) : on déclenche le blur, qui se charge lui
          // même de l'enregistrement ci-dessus, pour un seul chemin commun.
          // Contrairement à Tab, cela équivaut à quitter tout le groupe
          // (aucun autre champ de ce match ne reçoit le focus) : Entrée
          // enregistre donc toujours, même en cours de saisie du domicile.
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

// Enregistre au changement de statut (sélection atomique, pas de saisie
// caractère par caractère à protéger) ET en quittant le groupe de saisie
// (voir le commentaire équivalent sur AutoSubmitScoreInput) — le statut est
// en général le dernier champ du groupe, donc c'est souvent ce blur qui
// déclenche l'enregistrement final après avoir tabulé domicile → extérieur
// → statut.
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
      onBlur={(e) => {
        const form = e.currentTarget.form;
        if (!isSameForm(e.relatedTarget, form)) {
          form?.requestSubmit();
        }
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
