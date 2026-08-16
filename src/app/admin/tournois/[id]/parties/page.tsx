import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import { addGameAction, saveGameScoresAction } from "@/lib/actions/duplicate";
import { updateDuplicateSettingsAction } from "@/lib/actions/tournaments";
import { computeGameTop } from "@/lib/duplicate/board";

const formulaLabel: Record<string, string> = {
  NORMALE: "Partie normale",
  JOKER: "Partie joker",
  SEPT_SUR_HUIT: "Partie 7 sur 8",
  SEPT_SUR_HUIT_JOKER: "Partie 7 sur 8 joker",
  SEPT_ET_HUIT: "Partie 7 et 8",
  SEPT_ET_HUIT_JOKER: "Partie 7 et 8 joker",
};

const rythmeLabel: Record<string, string> = {
  NORMAL: "Normal (3 minutes)",
  SEMI_NORMAL: "Semi-normal (2 minutes 30)",
  SEMI_RAPIDE: "Semi-rapide (2 minutes)",
  SEMI_BLITZ: "Semi-blitz (1 minute 30)",
  BLITZ: "Blitz (1 minute)",
};

function FormulaSettingsForm({
  tournamentId,
  duplicateFormula,
  duplicateRythme,
  canManage,
}: {
  tournamentId: string;
  duplicateFormula: string | null;
  duplicateRythme: string | null;
  canManage: boolean;
}) {
  return (
    <div className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 flex flex-col gap-2">
      <p className="text-sm font-medium">Formule et rythme</p>
      {canManage ? (
        <form
          action={updateDuplicateSettingsAction.bind(null, tournamentId)}
          className="flex flex-wrap items-end gap-3"
        >
          <select
            name="duplicateFormula"
            defaultValue={duplicateFormula ?? "NORMALE"}
            className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
          >
            {Object.entries(formulaLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            name="duplicateRythme"
            defaultValue={duplicateRythme ?? "NORMAL"}
            className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
          >
            {Object.entries(rythmeLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-navy hover:bg-navy/90 text-white dark:bg-navy-light dark:hover:bg-navy-light/90 dark:text-navy px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Mettre à jour
          </button>
        </form>
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          {formulaLabel[duplicateFormula ?? "NORMALE"]} · {rythmeLabel[duplicateRythme ?? "NORMAL"]}
        </p>
      )}
      <p className="text-xs text-black/50 dark:text-white/50">
        La formule détermine les règles de jeu (tirage, primes de Scrabble)
        et le rythme la durée par défaut du chronomètre des nouvelles
        parties.
      </p>
    </div>
  );
}

export default async function GamesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole(STAFF_ROLES);

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      games: {
        orderBy: { number: "asc" },
        include: { results: true, referenceMoves: { select: { points: true } } },
      },
      registrations: { include: { player: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!tournament || tournament.type !== "DUPLICATE") notFound();

  const canManage = canManageTournament(session, tournament.organizerId);
  const players = tournament.registrations.map((r) => r.player);
  const addGameBound = addGameAction.bind(null, tournament.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/admin/tournois/${tournament.id}`}
          className="text-sm text-black/60 dark:text-white/60 hover:underline"
        >
          ← Retour au tournoi
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-navy dark:text-navy-light mt-1">
          Parties — {tournament.name}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
          <Link
            href={`/tournois/${tournament.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-emerald-700 dark:text-emerald-400 underline"
          >
            Voir la page publique ↗
          </Link>
          {canManage && tournament.games.length > 0 && (
            <a
              href={`/api/tournois/${tournament.id}/parties/export`}
              className="text-sm text-emerald-700 dark:text-emerald-400 underline"
            >
              Exporter les parties en CSV
            </a>
          )}
        </div>
      </div>

      <FormulaSettingsForm
        tournamentId={tournament.id}
        duplicateFormula={tournament.duplicateFormula}
        duplicateRythme={tournament.duplicateRythme}
        canManage={canManage}
      />

      {canManage && (
        <form action={addGameBound}>
          <button
            type="submit"
            className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
          >
            + Nouvelle partie
          </button>
        </form>
      )}

      {players.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          Inscrivez des joueurs avant de saisir des scores.
        </p>
      )}

      {tournament.games.map((game) => {
        const resultByPlayer = new Map(game.results.map((r) => [r.playerId, r]));
        const top = computeGameTop(game.referenceMoves, game.top);
        const topIsAutomatic = game.referenceMoves.length > 0;
        return (
          <section key={game.id} className="flex flex-col gap-3">
            <h2 className="font-heading text-lg font-semibold">
              Partie {game.number}
              {game.playedAt && (
                <span className="text-xs text-black/50 dark:text-white/50 ml-2">
                  {new Date(game.playedAt).toLocaleDateString("fr-FR")}
                </span>
              )}
              <Link
                href={`/admin/tournois/${tournament.id}/parties/${game.id}`}
                className="ml-3 text-sm font-normal text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                Détail coup par coup →
              </Link>
              <Link
                href={`/admin/tournois/${tournament.id}/parties/${game.id}/classement`}
                className="ml-3 text-sm font-normal text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                Fiche de classement →
              </Link>
            </h2>

            <form
              action={saveGameScoresAction.bind(null, tournament.id, game.id)}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor={`top_${game.id}`} className="font-medium">
                  Top de la partie
                </label>
                {topIsAutomatic ? (
                  <span title="Calculé automatiquement : somme des tops de chaque coup de référence saisi">
                    {top} <span className="text-black/50 dark:text-white/50">(auto)</span>
                  </span>
                ) : canManage ? (
                  <input
                    id={`top_${game.id}`}
                    type="number"
                    name="top"
                    defaultValue={game.top ?? ""}
                    className="w-24 rounded border-2 border-gold/40 dark:border-gold-light/40 px-2 py-1 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
                  />
                ) : (
                  <span>{game.top ?? "—"}</span>
                )}
              </div>

              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b border-black/10 dark:border-white/10">
                    <th className="py-2 pr-4">Joueur</th>
                    <th className="py-2 pr-4">Score</th>
                    <th className="py-2 pr-4">Pénalité</th>
                    <th className="py-2 pr-4">Net</th>
                    <th className="py-2 pr-4">Écart au top</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => {
                    const result = resultByPlayer.get(player.id);
                    const net = result ? result.score - result.penalty : null;
                    return (
                      <tr key={player.id} className="border-b border-black/5 dark:border-white/5">
                        <td className="py-2 pr-4">
                          {player.lastName} {player.firstName}
                        </td>
                        <td className="py-2 pr-4">
                          {canManage ? (
                            <input
                              type="number"
                              name={`score_${player.id}`}
                              defaultValue={result?.score ?? ""}
                              className="w-20 rounded border-2 border-gold/40 dark:border-gold-light/40 px-2 py-1 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
                            />
                          ) : (
                            (result?.score ?? "—")
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          {canManage ? (
                            <input
                              type="number"
                              name={`penalty_${player.id}`}
                              defaultValue={result?.penalty ?? 0}
                              className="w-20 rounded border-2 border-gold/40 dark:border-gold-light/40 px-2 py-1 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
                            />
                          ) : (
                            (result?.penalty ?? 0)
                          )}
                        </td>
                        <td className="py-2 pr-4">{net ?? "—"}</td>
                        <td className="py-2 pr-4">
                          {net !== null && top !== null ? top - net : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {canManage && (
                <button
                  type="submit"
                  className="self-start rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
                >
                  Enregistrer les scores
                </button>
              )}
            </form>
          </section>
        );
      })}

      {tournament.games.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          Aucune partie créée pour le moment.
        </p>
      )}
    </div>
  );
}
