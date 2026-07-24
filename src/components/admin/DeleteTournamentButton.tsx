"use client";

import { deleteTournamentAction } from "@/lib/actions/tournaments";

export function DeleteTournamentButton({
  tournamentId,
  tournamentName,
}: {
  tournamentId: string;
  tournamentName: string;
}) {
  return (
    <form
      action={deleteTournamentAction.bind(null, tournamentId)}
      onSubmit={(e) => {
        const confirmed = window.confirm(
          `Supprimer définitivement « ${tournamentName} » ? Les inscriptions, rondes/matchs, équipes, poules et parties associées seront aussi supprimées. Cette action est irréversible.`
        );
        if (!confirmed) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-red-600 text-red-600 px-4 py-2 text-sm font-medium hover:bg-red-600/5"
      >
        Supprimer ce tournoi
      </button>
    </form>
  );
}
