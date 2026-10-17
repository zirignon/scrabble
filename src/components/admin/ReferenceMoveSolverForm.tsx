"use client";

import { useEffect, useState, useTransition } from "react";
import type { NavigatorMove } from "@/components/admin/ReferenceMoveHistory";
import type { SolverSolution } from "@/lib/duplicate/solver";

// Panneau de saisie du coup de référence : recherche de solutions mise en
// avant (liste large, toujours visible une fois la recherche lancée) à
// gauche, choix du coup à enregistrer dans une colonne latérale à droite.
// Le coup enregistré DOIT provenir d'une solution de la liste — pas de
// saisie manuelle possible, pour garantir que le coup de référence
// correspond toujours à un placement réellement valide trouvé par le
// solveur. Survoler (ou donner le focus à) une solution de la liste
// remonte (onPreviewChange) la solution survolée à la page, qui l'affiche
// en aperçu directement sur la grande grille de référence (lettres
// nouvelles mises en évidence) — cet aperçu n'est qu'un état local du
// navigateur de l'arbitre, jamais enregistré ni diffusé sur l'affichage
// grand écran tant que le coup n'est pas validé. Reste affiché sur la
// solution choisie une fois la souris repartie. Seule exception à la
// liste : une « Passe » (aucun mot jouable trouvé pour ce tirage), qui
// n'a besoin d'aucune solution.
//
// Sert aussi à MODIFIER un coup déjà saisi (editingMove non nul) : plutôt
// qu'un formulaire par ligne dans le tableau d'historique (qui en
// occupait beaucoup trop), "Modifier" dans ReferenceMoveHistory charge le
// coup choisi dans CE panneau (réutilisé, seule zone d'édition de la
// page) — le tirage de ce coup préremplit la recherche, l'arbitre choisit
// à nouveau une solution dans la liste pour la corriger (ou la confirmer
// telle quelle), avec Annuler/Supprimer en plus du bouton d'enregistrement.
export function ReferenceMoveSolverForm({
  addAction,
  updateAction,
  deleteAction,
  findSolutions,
  onPreviewChange,
  onCancelEdit,
  editingMove,
  turnNumber,
  initialRack = "",
  historyVisible,
  onToggleHistory,
}: {
  addAction: (formData: FormData) => Promise<void>;
  updateAction?: (moveId: string, formData: FormData) => Promise<void>;
  deleteAction?: (moveId: string) => Promise<void>;
  findSolutions: (rack: string) => Promise<SolverSolution[]>;
  onPreviewChange?: (solution: SolverSolution | null) => void;
  onCancelEdit?: () => void;
  editingMove?: NavigatorMove | null;
  turnNumber: number;
  initialRack?: string;
  // Bouton "Modifier" sous le bouton d'enregistrement, qui révèle/masque
  // l'historique des coups déjà saisis (voir ArbitrationGridPanel) — pas
  // affiché en continu, pour ne pas allonger la page avec une partie qui
  // compte déjà beaucoup de coups.
  historyVisible?: boolean;
  onToggleHistory?: () => void;
}) {
  const [rack, setRack] = useState(initialRack);
  const [solutions, setSolutions] = useState<SolverSolution[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isPass, setIsPass] = useState(editingMove?.isPass ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, startSubmitTransition] = useTransition();

  function handleSearch() {
    setError(null);
    setSolutions(null);
    setSelectedIndex(null);
    setHoveredIndex(null);
    startTransition(async () => {
      try {
        const results = await findSolutions(rack);
        setSolutions(results);
      } catch {
        setError("Erreur lors de la recherche de solutions.");
      }
    });
  }

  const selected = solutions && selectedIndex !== null ? solutions[selectedIndex] : null;
  const canSubmit = (isPass || selected !== null) && !isSubmitting;

  // L'aperçu montre la solution survolée, ou à défaut celle déjà choisie,
  // tant que l'arbitre n'est pas passé : la souris qui quitte la liste ne
  // doit pas faire disparaître l'aperçu de la solution retenue.
  const previewed =
    !isPass && solutions
      ? hoveredIndex !== null
        ? solutions[hoveredIndex]
        : selected
      : null;

  useEffect(() => {
    onPreviewChange?.(previewed);
  }, [previewed, onPreviewChange]);

  // Efface l'aperçu remonté au parent si ce panneau disparaît (ex. partie
  // clôturée en cours de route) sans quoi la grande grille resterait
  // bloquée sur le dernier aperçu affiché.
  useEffect(() => {
    return () => onPreviewChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildFormData() {
    const formData = new FormData();
    formData.set("reference", selected ? selected.reference : isPass ? "H8" : "");
    formData.set("word", selected ? selected.word : "");
    formData.set("rack", rack);
    if (isPass) formData.set("isPass", "on");
    return formData;
  }

  function handleSubmit() {
    const formData = buildFormData();
    startSubmitTransition(async () => {
      if (editingMove && updateAction) {
        await updateAction(editingMove.id, formData);
        onCancelEdit?.();
      } else {
        await addAction(formData);
      }
    });
  }

  function handleDelete() {
    if (!editingMove || !deleteAction) return;
    startSubmitTransition(async () => {
      await deleteAction(editingMove.id);
      onCancelEdit?.();
    });
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4 rounded border border-black/10 dark:border-white/20 p-3">
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-black/50 dark:text-white/50">
            {editingMove ? `Modification du coup #${turnNumber}` : `Tirage #${turnNumber}`}
          </span>
          <input
            type="text"
            value={rack}
            onChange={(e) => setRack(e.target.value)}
            placeholder="Ex. AEHMNRS"
            className="w-28 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm uppercase"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={!rack.trim() || isPending}
            className="rounded bg-navy hover:bg-navy/90 dark:bg-navy-light dark:text-navy text-white px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
          >
            {isPending ? "Recherche…" : "Solutions"}
          </button>
        </div>

        {error && <p className="text-xs text-brick">{error}</p>}

        {/* Hauteur fixe (une seule ligne, tronquée) : un texte de longueur
            variable ici ferait bouger la liste juste en dessous à chaque
            survol, ce qui déplace les options sous un curseur pourtant
            immobile et déclenche en cascade le survol de l'option
            suivante — donnant l'impression que le défilement se déclenche
            tout seul. */}
        <p className="h-4 text-xs text-black/50 dark:text-white/50 truncate">
          {previewed
            ? `Aperçu sur la grille : ${previewed.word.toUpperCase()} ${previewed.reference}`
            : "Survolez une solution pour l'afficher en aperçu sur la grille."}
        </p>

        <div
          role="listbox"
          aria-label="Solutions"
          className="min-h-[10rem] max-h-[20rem] overflow-auto rounded border border-black/10 dark:border-white/20 text-sm divide-y divide-black/5 dark:divide-white/5"
        >
          {solutions === null ? (
            <p className="p-3 text-xs text-black/40 dark:text-white/40">
              Saisissez le tirage puis lancez la recherche pour afficher tous les placements
              possibles (mot, référence, score).
            </p>
          ) : solutions.length === 0 ? (
            <p className="p-3 text-xs text-black/50 dark:text-white/50">
              Aucune solution trouvée pour ce tirage (ou dictionnaire non importé).
            </p>
          ) : (
            solutions.map((s, i) => (
              <button
                key={i}
                type="button"
                role="option"
                aria-selected={selectedIndex === i}
                disabled={isPass}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex((h) => (h === i ? null : h))}
                onFocus={() => setHoveredIndex(i)}
                onBlur={() => setHoveredIndex((h) => (h === i ? null : h))}
                onClick={() => setSelectedIndex(i)}
                className={`w-full flex items-center justify-between gap-2 px-2 py-1 text-left transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                  selectedIndex === i
                    ? "bg-moss/15 dark:bg-moss-light/15 font-semibold"
                    : hoveredIndex === i
                    ? "bg-sky-50 dark:bg-sky-900/30"
                    : ""
                }`}
              >
                <span className={hoveredIndex === i ? "text-sky-600 dark:text-sky-400 font-semibold" : ""}>
                  {s.word.toUpperCase()}
                </span>
                <span className="text-black/50 dark:text-white/50 tabular-nums">{s.reference}</span>
                <span className="tabular-nums">{s.score} pts</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="sm:w-56 shrink-0 flex flex-col gap-2">
        <p className="text-xs font-medium text-black/60 dark:text-white/60">
          {editingMove ? "Modifier ce coup" : "Coup à enregistrer"}
        </p>
        {editingMove && (
          <p className="text-xs text-black/50 dark:text-white/50">
            Actuellement : {editingMove.isPass ? "Passe" : editingMove.word || "—"}
            {editingMove.reference ? ` ${editingMove.reference}` : ""} ({editingMove.points} pts)
          </p>
        )}
        {selected ? (
          <p className="text-sm">
            <span className="font-semibold">{selected.word.toUpperCase()}</span>{" "}
            <span className="text-black/60 dark:text-white/60">{selected.reference}</span>{" "}
            <span className="text-black/50 dark:text-white/50">({selected.score} pts)</span>
          </p>
        ) : (
          <p className="text-xs text-black/40 dark:text-white/40">
            {isPass ? "Passe : aucun mot à enregistrer." : "Aucune solution sélectionnée."}
          </p>
        )}
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={isPass}
            onChange={(e) => {
              setIsPass(e.target.checked);
              if (e.target.checked) {
                setSelectedIndex(null);
                setHoveredIndex(null);
              }
            }}
          />
          Passe (aucun mot jouable trouvé)
        </label>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40"
        >
          {editingMove ? "Enregistrer la modification" : "+ Coup de référence"}
        </button>
        {!editingMove && onToggleHistory && (
          <button
            type="button"
            onClick={onToggleHistory}
            className="rounded bg-gold/15 hover:bg-gold/25 text-navy border border-gold/50 dark:bg-gold-light/15 dark:hover:bg-gold-light/25 dark:text-gold-light dark:border-gold-light/50 px-3 py-1.5 text-xs font-medium transition-colors"
          >
            {historyVisible ? "Masquer les coups déjà saisis" : "Modifier un coup déjà saisi"}
          </button>
        )}
        {editingMove && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={isSubmitting}
              className="flex-1 rounded border border-black/10 dark:border-white/20 px-3 py-1.5 text-xs disabled:opacity-40"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSubmitting}
              className="flex-1 rounded bg-brick hover:bg-brick/90 text-white px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
            >
              Supprimer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
