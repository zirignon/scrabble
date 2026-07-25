import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import {
  addGameAction,
  pauseGameTimerAction,
  resetGameTimerAction,
  saveGameScoresAction,
  setGameTimerDurationAction,
  startGameTimerAction,
  validateGameRackAction,
} from "@/lib/actions/duplicate";
import { updateDuplicateFormulaAction } from "@/lib/actions/tournaments";
import { LiveCountdown } from "@/components/LiveCountdown";
import type { Game } from "@prisma/client";

const formulaLabel: Record<string, string> = {
  NORMALE: "Normale (3 min par coup)",
  SEMI_RAPIDE: "Semi-rapide (2 min par coup)",
  BLITZ: "Blitz (1 min par coup)",
  JOKER: "Joker (6 lettres + 1 joker)",
  SEPT_SUR_HUIT: "7 sur 8 (tirage de 8, 7 jouables)",
  SEPT_ET_HUIT: "7 et 8 (prime de 75 pts à 8 lettres)",
};

function FormulaSettingsForm({
  tournamentId,
  duplicateFormula,
  canManage,
}: {
  tournamentId: string;
  duplicateFormula: string | null;
  canManage: boolean;
}) {
  return (
    <div className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 flex flex-col gap-2">
      <p className="text-sm font-medium">Formule</p>
      {canManage ? (
        <form
          action={updateDuplicateFormulaAction.bind(null, tournamentId)}
          className="flex items-end gap-3"
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
          <button
            type="submit"
            className="rounded-md border border-black/10 dark:border-white/20 px-3 py-1.5 text-sm"
          >
            Mettre à jour
          </button>
        </form>
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          {formulaLabel[duplicateFormula ?? "NORMALE"]}
        </p>
      )}
      <p className="text-xs text-black/50 dark:text-white/50">
        S&apos;applique à la durée par défaut du chronomètre des nouvelles
        parties et à la prime de Scrabble de la grille de référence.
      </p>
    </div>
  );
}

function GameTimerControls({
  game,
  canManage,
  tournamentId,
}: {
  game: Game;
  canManage: boolean;
  tournamentId: string;
}) {
  const runningSince = game.timerRunning && game.timerStartedAt
    ? game.timerStartedAt.toISOString()
    : null;

  return (
    <div className="flex flex-col gap-2">
      {canManage && (
        <form
          action={validateGameRackAction.bind(null, tournamentId, game.id)}
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="text-black/50 dark:text-white/50">Tirage du tour :</span>
          <input
            type="text"
            name="rack"
            defaultValue={game.pendingRack ?? ""}
            placeholder="Ex. AEHMNRS"
            className="w-32 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm uppercase"
          />
          <button
            type="submit"
            className="rounded border border-black/10 dark:border-white/20 px-2 py-1 text-xs"
          >
            Valider le tirage
          </button>
          {game.pendingRack && (
            <span className="text-xs text-moss">✓ Projeté sur l&apos;affichage grand écran</span>
          )}
        </form>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-black/50 dark:text-white/50">⏱ Temps restant :</span>
        <LiveCountdown
          baselineSeconds={game.timerRemainingSeconds ?? game.timerDurationSeconds}
          runningSince={runningSince}
          className={game.timerRunning ? "font-semibold text-emerald-700 dark:text-emerald-400 text-base" : "text-base"}
        />
        {canManage && (
          <>
            <form action={startGameTimerAction.bind(null, tournamentId, game.id)}>
              <button
                type="submit"
                disabled={!game.pendingRack}
                title={!game.pendingRack ? "Validez d'abord le tirage du tour" : undefined}
                className="rounded border border-black/10 dark:border-white/20 px-2 py-1 text-xs disabled:opacity-40"
              >
                ▶ Démarrer
              </button>
            </form>
            <form action={pauseGameTimerAction.bind(null, tournamentId, game.id)}>
            <button
              type="submit"
              className="rounded border border-black/10 dark:border-white/20 px-2 py-1 text-xs"
            >
              ⏸ Pause
            </button>
          </form>
          <form action={resetGameTimerAction.bind(null, tournamentId, game.id)}>
            <button
              type="submit"
              className="rounded border border-black/10 dark:border-white/20 px-2 py-1 text-xs"
            >
              ↺ Réinitialiser
            </button>
          </form>
          <form
            action={setGameTimerDurationAction.bind(null, tournamentId, game.id)}
            className="flex items-center gap-1"
          >
            <input
              type="number"
              name="minutes"
              placeholder="min"
              defaultValue={Math.round(game.timerDurationSeconds / 60)}
              className="w-16 rounded border border-black/10 dark:border-white/20 px-1.5 py-1 bg-transparent text-xs"
            />
            <button
              type="submit"
              className="rounded border border-black/10 dark:border-white/20 px-2 py-1 text-xs"
            >
              Durée
            </button>
          </form>
          </>
        )}
      </div>
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
        include: { results: true },
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
        <h1 className="text-2xl font-semibold mt-1">
          Parties — {tournament.name}
        </h1>
        {canManage && tournament.games.length > 0 && (
          <a
            href={`/api/tournois/${tournament.id}/parties/export`}
            className="text-sm text-emerald-700 dark:text-emerald-400 underline"
          >
            Exporter les parties en CSV
          </a>
        )}
      </div>

      <FormulaSettingsForm
        tournamentId={tournament.id}
        duplicateFormula={tournament.duplicateFormula}
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
        return (
          <section key={game.id} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
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

            <GameTimerControls game={game} canManage={canManage} tournamentId={tournament.id} />

            <form
              action={saveGameScoresAction.bind(null, tournament.id, game.id)}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor={`top_${game.id}`} className="font-medium">
                  Top de la partie
                </label>
                {canManage ? (
                  <input
                    id={`top_${game.id}`}
                    type="number"
                    name="top"
                    defaultValue={game.top ?? ""}
                    className="w-24 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
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
                          {player.firstName} {player.lastName}
                        </td>
                        <td className="py-2 pr-4">
                          {canManage ? (
                            <input
                              type="number"
                              name={`score_${player.id}`}
                              defaultValue={result?.score ?? ""}
                              className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
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
                              className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
                            />
                          ) : (
                            (result?.penalty ?? 0)
                          )}
                        </td>
                        <td className="py-2 pr-4">{net ?? "—"}</td>
                        <td className="py-2 pr-4">
                          {net !== null && game.top !== null ? game.top - net : "—"}
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
