"use client";

export interface NavigatorMove {
  id: string;
  turnNumber: number;
  reference: string;
  rack: string;
  word: string;
  points: number;
  isPass: boolean;
}

// Historique des coups de référence : table purement en lecture, une
// ligne par coup. La modification d'un coup existant ne se fait pas ici
// (un formulaire par ligne occupait trop de place) — "Modifier" charge
// ce coup dans le panneau "Solutions" déjà affiché sur la page (voir
// ArbitrationGridPanel/ReferenceMoveSolverForm), seule zone d'édition de
// la page. Colonnes en whitespace-nowrap : un tirage ou un mot long ne
// doit jamais faire passer une ligne sur deux lignes (ce qui gonflait la
// hauteur du tableau) — le conteneur défile horizontalement si besoin à
// la place. Pour l'arbitre (canManage), ce tableau n'est révélé qu'à la
// demande (bouton "Modifier" du panneau Solutions, voir
// ArbitrationGridPanel) plutôt qu'affiché en permanence : hauteur
// plafonnée avec défilement vertical, pour qu'une partie avec beaucoup de
// coups n'allonge jamais la page. Pour un arbitre assigné en lecture
// seule (!canManage), reste affiché en permanence (pas de panneau
// Solutions pour lui, donc pas d'autre endroit où consulter l'historique).
export function ReferenceMoveHistory({
  moves,
  canManage,
  editingMoveId,
  onEdit,
}: {
  moves: NavigatorMove[];
  canManage: boolean;
  editingMoveId?: string | null;
  onEdit?: (move: NavigatorMove) => void;
}) {
  return (
    <div className="max-h-72 overflow-auto rounded border border-black/10 dark:border-white/20">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-white dark:bg-navy">
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pl-2 pr-4">Coup</th>
            <th className="py-2 pr-4">Référence</th>
            <th className="py-2 pr-4">Tirage</th>
            <th className="py-2 pr-4">Mot</th>
            <th className="py-2 pr-4">Points</th>
            <th className="py-2 pr-4">Passe</th>
            {canManage && <th className="py-2 pr-4"></th>}
          </tr>
        </thead>
        <tbody>
          {moves.map((move) => (
            <tr
              key={move.id}
              className={`border-b border-black/5 dark:border-white/5 ${
                editingMoveId === move.id ? "bg-gold/10 dark:bg-gold-light/10" : ""
              }`}
            >
              <td className="py-1.5 pl-2 pr-4 whitespace-nowrap">{move.turnNumber}</td>
              <td className="py-1.5 pr-4 whitespace-nowrap">{move.reference}</td>
              <td className="py-1.5 pr-4 whitespace-nowrap">{move.rack || "—"}</td>
              <td className="py-1.5 pr-4 whitespace-nowrap">{move.isPass ? "Passe" : move.word || "—"}</td>
              <td className="py-1.5 pr-4 whitespace-nowrap">{move.points}</td>
              <td className="py-1.5 pr-4 whitespace-nowrap">{move.isPass ? "Oui" : ""}</td>
              {canManage && (
                <td className="py-1.5 pr-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => onEdit?.(move)}
                    className={`text-xs underline ${
                      editingMoveId === move.id
                        ? "text-black/40 dark:text-white/40"
                        : "text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {editingMoveId === move.id ? "En cours…" : "Modifier"}
                  </button>
                </td>
              )}
            </tr>
          ))}
          {moves.length === 0 && (
            <tr>
              <td colSpan={canManage ? 7 : 6} className="py-2 pl-2 text-black/50 dark:text-white/50">
                Aucun coup de référence saisi.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
