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

// Repère tous les champs de score navigables au sein d'une même ligne de
// tableau (<tr>) — une ligne peut en contenir plusieurs (domicile/extérieur,
// et jusqu'à 3 manches en 2 manches + belle côté LegScoreCell). L'ordre suit
// l'ordre du DOM, qui correspond à l'ordre visuel gauche→droite.
function scoreInputsInRow(row: Element): HTMLInputElement[] {
  return Array.from(row.querySelectorAll<HTMLInputElement>('input[data-score-nav="true"]'));
}

// Navigation façon tableur entre les champs de score, avec les flèches du
// clavier : Haut/Bas passe à la même position dans la ligne précédente/
// suivante (en sautant les lignes qui n'ont pas de champ à cette position,
// ex. une manche retour pas encore générée) ; Gauche/Droite passe au champ
// voisin dans la même ligne. Ne s'active qu'en bordure du champ courant
// (voir l'appel dans onKeyDown) pour ne pas gêner le déplacement normal du
// curseur à l'intérieur d'un score à plusieurs chiffres.
function navigateScoreInput(current: HTMLInputElement, direction: "up" | "down" | "left" | "right") {
  const row = current.closest("tr");
  if (!row) return;

  if (direction === "left" || direction === "right") {
    const inputs = scoreInputsInRow(row);
    const index = inputs.indexOf(current);
    const target = inputs[direction === "left" ? index - 1 : index + 1];
    target?.focus();
    target?.select();
    return;
  }

  const columnIndex = scoreInputsInRow(row).indexOf(current);
  if (columnIndex === -1) return;
  let sibling = direction === "up" ? row.previousElementSibling : row.nextElementSibling;
  while (sibling) {
    const target = scoreInputsInRow(sibling)[columnIndex];
    if (target) {
      target.focus();
      target.select();
      return;
    }
    sibling = direction === "up" ? sibling.previousElementSibling : sibling.nextElementSibling;
  }
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
      // Texte plutôt que "number" : nécessaire pour lire selectionStart/End
      // ci-dessous (non supporté sur un <input type="number"> par les
      // navigateurs), afin de ne naviguer vers le champ voisin qu'en
      // bordure du champ courant plutôt qu'à chaque pression de flèche —
      // voir onKeyDown. inputMode="numeric" garde un clavier numérique sur
      // mobile ; la validation du format reste côté serveur (recordMatchResultAction).
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      // Un <input type="number"> n'affiche pas la liste des anciennes
      // valeurs saisies sous ce name= ; en repassant à type="text"
      // ci-dessus, le navigateur se met à en suggérer (name="homeScore"/
      // "awayScore" étant repris sur chaque match de la page) — désactivé
      // explicitement, ce champ ne doit jamais proposer de score d'un
      // autre match.
      autoComplete="off"
      data-score-nav="true"
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
          return;
        }
        // Navigation façon tableur (voir navigateScoreInput) : Haut/Bas
        // toujours, Gauche/Droite seulement en bordure du champ courant
        // (sinon ça gênerait la correction d'un chiffre au milieu d'un
        // score à plusieurs chiffres).
        const input = e.currentTarget;
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          navigateScoreInput(input, e.key === "ArrowUp" ? "up" : "down");
        } else if (e.key === "ArrowLeft" && input.selectionStart === 0 && input.selectionEnd === 0) {
          e.preventDefault();
          navigateScoreInput(input, "left");
        } else if (
          e.key === "ArrowRight" &&
          input.selectionStart === input.value.length &&
          input.selectionEnd === input.value.length
        ) {
          e.preventDefault();
          navigateScoreInput(input, "right");
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
