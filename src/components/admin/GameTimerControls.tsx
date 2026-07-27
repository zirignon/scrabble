import {
  pauseGameTimerAction,
  rejectGameRackAction,
  resetGameTimerAction,
  setGameTimerDurationAction,
  startGameTimerAction,
  validateGameRackAction,
} from "@/lib/actions/duplicate";
import { LiveCountdown } from "@/components/LiveCountdown";
import { computeLastReliquat } from "@/lib/duplicate/board";
import { formatClock } from "@/lib/timer";
import type { Game, ReferenceMove } from "@prisma/client";

export function GameTimerControls({
  game,
  referenceMoves,
  canManage,
  alertSeconds,
  tournamentId,
}: {
  game: Game;
  referenceMoves: ReferenceMove[];
  canManage: boolean;
  alertSeconds: number;
  tournamentId: string;
}) {
  const runningSince = game.timerRunning && game.timerStartedAt
    ? game.timerStartedAt.toISOString()
    : null;

  // Préremplit le champ avec le reliquat du dernier coup joué (suivi de
  // "+") tant qu'aucun tirage n'a encore été validé pour ce tour : l'arbitre
  // n'a qu'à compléter avec les nouvelles lettres tirées. pendingRack vaut
  // "" (distinct de null) après un rejet : le champ reste alors vierge
  // plutôt que de resuggérer le même reliquat.
  const rackDefaultValue =
    game.pendingRack === null ? computeLastReliquat(referenceMoves) ?? "" : game.pendingRack;

  return (
    <div className="flex flex-col gap-2">
      {canManage && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <form
            action={validateGameRackAction.bind(null, tournamentId, game.id)}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-black/50 dark:text-white/50">Tirage du tour :</span>
            <input
              type="text"
              name="rack"
              defaultValue={rackDefaultValue}
              placeholder="Ex. AEHMNRS"
              className="w-32 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm uppercase"
            />
            <button
              type="submit"
              className="rounded border border-black/10 dark:border-white/20 px-2 py-1 text-xs"
            >
              Valider le tirage
            </button>
          </form>
          <form action={rejectGameRackAction.bind(null, tournamentId, game.id)}>
            <button
              type="submit"
              title="Efface le reliquat suggéré et le tirage éventuellement validé (erreur de saisie, tirage contesté...), sans jouer de coup, et réinitialise le chrono"
              className="rounded border border-brick/40 text-brick px-2 py-1 text-xs"
            >
              Rejeter le tirage
            </button>
          </form>
          {game.pendingRack && (
            <span className="text-xs text-moss">✓ Projeté sur l&apos;affichage grand écran</span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-black/50 dark:text-white/50">⏱ Temps restant :</span>
        <LiveCountdown
          baselineSeconds={game.timerRemainingSeconds ?? game.timerDurationSeconds}
          runningSince={runningSince}
          alertSeconds={alertSeconds}
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
              type="text"
              name="duration"
              placeholder="mm:ss"
              title="Durée au format minutes:secondes (ex. 2:30), ou un nombre de minutes (ex. 3)"
              defaultValue={formatClock(game.timerDurationSeconds)}
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
