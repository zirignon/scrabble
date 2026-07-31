import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import {
  addManualRoundAction,
  addMatchAction,
  generateFinalPhaseFromPoolsAction,
  generateFinalPhaseFromStandingsAction,
  generateKnockoutBracketAction,
  generateNextKnockoutRoundAction,
  generateNextSwissRoundAction,
  generateNextTeamKnockoutRoundAction,
  generateNextTeamSwissRoundAction,
  generatePoolsRoundRobinAction,
  generateRoundRobinAction,
  generateTeamFinalPhaseFromPoolsAction,
  generateTeamFinalPhaseFromStandingsAction,
  generateTeamKnockoutBracketAction,
  generateTeamPoolsRoundRobinAction,
  generateTeamRoundRobinAction,
  pauseMatchClockAction,
  recordMatchResultAction,
  resetMatchClockAction,
  setMatchClockDurationAction,
  startMatchClockAction,
  updateFinalPhaseSettingsAction,
} from "@/lib/actions/classic";
import { countKnockoutEntrants, getKnockoutStageLabel } from "@/lib/classic/knockout";
import { RoundActionButton } from "@/components/admin/RoundActionButton";
import { LiveCountdown } from "@/components/LiveCountdown";
import type { Match, Player, Pool, Team } from "@prisma/client";

const statusLabel: Record<string, string> = {
  SCHEDULED: "À jouer",
  PLAYED: "Joué",
  FORFEIT_HOME: "Forfait (domicile)",
  FORFEIT_AWAY: "Forfait (extérieur)",
  CANCELLED: "Annulé",
};

type MatchWithRelations = Match & {
  homePlayer: Player | null;
  awayPlayer: Player | null;
  homeTeam: Team | null;
  awayTeam: Team | null;
  pool: Pool | null;
};

function MatchClockControls({
  match,
  canManage,
  tournamentId,
}: {
  match: MatchWithRelations;
  canManage: boolean;
  tournamentId: string;
}) {
  if (match.clockInitialSeconds == null) {
    if (!canManage) return null;
    return (
      <form
        action={setMatchClockDurationAction.bind(null, tournamentId, match.id)}
        className="flex items-center gap-1"
      >
        <input
          type="number"
          name="minutes"
          placeholder="min/camp"
          className="w-20 rounded border border-black/10 dark:border-white/20 px-1.5 py-0.5 bg-transparent"
        />
        <button
          type="submit"
          className="rounded border border-black/10 dark:border-white/20 px-2 py-0.5"
        >
          ⏱ Activer un chrono
        </button>
      </form>
    );
  }

  const runningSince = match.clockStartedAt ? match.clockStartedAt.toISOString() : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-black/50 dark:text-white/50">⏱</span>
      <LiveCountdown
        baselineSeconds={match.homeClockRemainingSeconds ?? match.clockInitialSeconds}
        runningSince={match.clockRunningSide === "HOME" ? runningSince : null}
        className={
          match.clockRunningSide === "HOME"
            ? "font-semibold text-emerald-700 dark:text-emerald-400"
            : ""
        }
      />
      <span className="text-black/40 dark:text-white/40">/</span>
      <LiveCountdown
        baselineSeconds={match.awayClockRemainingSeconds ?? match.clockInitialSeconds}
        runningSince={match.clockRunningSide === "AWAY" ? runningSince : null}
        className={
          match.clockRunningSide === "AWAY"
            ? "font-semibold text-emerald-700 dark:text-emerald-400"
            : ""
        }
      />
      {canManage && (
        <>
          <form action={startMatchClockAction.bind(null, tournamentId, match.id)}>
            <input type="hidden" name="side" value="HOME" />
            <button
              type="submit"
              className="rounded border border-black/10 dark:border-white/20 px-1.5 py-0.5"
            >
              ▶ Dom.
            </button>
          </form>
          <form action={startMatchClockAction.bind(null, tournamentId, match.id)}>
            <input type="hidden" name="side" value="AWAY" />
            <button
              type="submit"
              className="rounded border border-black/10 dark:border-white/20 px-1.5 py-0.5"
            >
              ▶ Ext.
            </button>
          </form>
          <form action={pauseMatchClockAction.bind(null, tournamentId, match.id)}>
            <button
              type="submit"
              className="rounded border border-black/10 dark:border-white/20 px-1.5 py-0.5"
            >
              ⏸
            </button>
          </form>
          <form action={resetMatchClockAction.bind(null, tournamentId, match.id)}>
            <button
              type="submit"
              className="rounded border border-black/10 dark:border-white/20 px-1.5 py-0.5"
            >
              ↺
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function MatchRow({
  match,
  canManage,
  tournamentId,
}: {
  match: MatchWithRelations;
  canManage: boolean;
  tournamentId: string;
}) {
  return (
    <Fragment>
      <tr className="border-b border-black/5 dark:border-white/5">
        <td className="py-2 pr-4">{match.table ?? "—"}</td>
        <td className="py-2 pr-4 truncate">
          {match.homePlayer
            ? `${match.homePlayer.lastName} ${match.homePlayer.firstName}`
            : "—"}
        </td>
        <td className="py-2 pr-4">
          {match.isBye ? (
            <span className="text-black/50 dark:text-white/50">Exempt (bye)</span>
          ) : canManage ? (
            <form
              action={recordMatchResultAction.bind(null, tournamentId, match.id)}
              className="flex flex-wrap items-center gap-1"
            >
              <input
                type="number"
                name="homeScore"
                defaultValue={match.homeScore ?? ""}
                className="w-16 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
              />
              <span>-</span>
              <input
                type="number"
                name="awayScore"
                defaultValue={match.awayScore ?? ""}
                className="w-16 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent"
              />
              <select
                name="status"
                defaultValue={match.status}
                className="rounded border border-black/10 dark:border-white/20 px-1 py-1 bg-transparent text-xs"
              >
                {Object.entries(statusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded bg-emerald-700 text-white px-2 py-1 text-xs"
              >
                OK
              </button>
            </form>
          ) : (
            <span>
              {match.homeScore ?? "-"} - {match.awayScore ?? "-"}
            </span>
          )}
        </td>
        <td className="py-2 pl-3 pr-4 truncate">
          {match.awayPlayer
            ? `${match.awayPlayer.lastName} ${match.awayPlayer.firstName}`
            : "—"}
        </td>
        <td className="py-2 pl-3 pr-4 truncate">{statusLabel[match.status]}</td>
      </tr>
      {!match.isBye && (
        <tr className="border-b border-black/5 dark:border-white/5">
          <td colSpan={5} className="pb-2 pl-4 text-xs">
            <MatchClockControls
              match={match}
              canManage={canManage}
              tournamentId={tournamentId}
            />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// table-fixed avec des largeurs de colonne explicites (identiques d'une
// carte à l'autre) : chaque poule/confrontation ayant sa propre table
// indépendante, un table-layout auto laisserait chacune caler ses colonnes
// sur son propre contenu, décalant les colonnes d'une carte à l'autre.
function MatchTable({
  matches,
  canManage,
  tournamentId,
}: {
  matches: MatchWithRelations[];
  canManage: boolean;
  tournamentId: string;
}) {
  return (
    <table className="w-full text-sm border-collapse table-fixed">
      <thead>
        <tr className="text-left border-b border-black/10 dark:border-white/10">
          <th className="py-2 pr-4 w-[6%]">Table</th>
          <th className="py-2 pr-4 w-[19%]">Domicile</th>
          <th className="py-2 pr-4 w-[38%]">Score</th>
          <th className="py-2 pl-3 pr-4 w-[21%]">Extérieur</th>
          <th className="py-2 pl-3 pr-4 w-[16%]">Statut</th>
        </tr>
      </thead>
      <tbody>
        {matches.map((match) => (
          <MatchRow
            key={match.id}
            match={match}
            canManage={canManage}
            tournamentId={tournamentId}
          />
        ))}
        {matches.length === 0 && (
          <tr>
            <td colSpan={5} className="py-3 text-black/50 dark:text-white/50">
              Aucun match dans cette ronde.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function FinalPhaseSettingsForm({
  tournamentId,
  finalPhaseEnabled,
  finalPhaseQualifiers,
  canManage,
}: {
  tournamentId: string;
  finalPhaseEnabled: boolean;
  finalPhaseQualifiers: number;
  canManage: boolean;
}) {
  return (
    <div className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 flex flex-col gap-2">
      <p className="text-sm font-medium">Phase finale (optionnelle)</p>
      {canManage ? (
        <form
          action={updateFinalPhaseSettingsAction.bind(null, tournamentId)}
          className="flex items-end gap-3"
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="finalPhaseEnabled"
              defaultChecked={finalPhaseEnabled}
              className="rounded border-black/20 dark:border-white/30"
            />
            Élimination directe après la phase principale
          </label>
          <div className="flex flex-col gap-1">
            <label htmlFor="finalPhaseQualifiers" className="text-xs font-medium">
              Nombre de qualifiés
            </label>
            <input
              id="finalPhaseQualifiers"
              name="finalPhaseQualifiers"
              type="number"
              min={2}
              defaultValue={finalPhaseQualifiers}
              className="w-24 rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-black/10 dark:border-white/20 px-3 py-1.5 text-sm"
          >
            Mettre à jour
          </button>
        </form>
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          {finalPhaseEnabled
            ? `Phase finale activée, ${finalPhaseQualifiers} qualifié(s).`
            : "Pas de phase finale pour ce tournoi."}
        </p>
      )}
      <p className="text-xs text-black/50 dark:text-white/50">
        Une fois activée, la phase finale (élimination directe entre les N
        premiers du classement général) se génère depuis les boutons
        ci-dessous, une fois la phase principale terminée.
      </p>
    </div>
  );
}

export default async function RoundsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole(STAFF_ROLES);

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      rounds: {
        orderBy: { number: "asc" },
        include: {
          matches: {
            include: {
              homePlayer: true,
              awayPlayer: true,
              homeTeam: true,
              awayTeam: true,
              pool: true,
            },
            orderBy: { table: "asc" },
          },
        },
      },
      registrations: { include: { player: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!tournament || tournament.type !== "CLASSIC") notFound();

  const canManage = canManageTournament(session, tournament.organizerId);
  const players = tournament.registrations.map((r) => r.player);
  const generateBound = generateRoundRobinAction.bind(null, tournament.id);
  const generateTeamBound = generateTeamRoundRobinAction.bind(null, tournament.id);
  const generateSwissBound = generateNextSwissRoundAction.bind(null, tournament.id);
  const generateTeamSwissBound = generateNextTeamSwissRoundAction.bind(null, tournament.id);
  const generatePoolsBound = generatePoolsRoundRobinAction.bind(null, tournament.id);
  const generateTeamPoolsBound = generateTeamPoolsRoundRobinAction.bind(null, tournament.id);
  const generateKnockoutBound = generateKnockoutBracketAction.bind(null, tournament.id);
  const generateNextKnockoutBound = generateNextKnockoutRoundAction.bind(null, tournament.id);
  const generateTeamKnockoutBound = generateTeamKnockoutBracketAction.bind(null, tournament.id);
  const generateNextTeamKnockoutBound = generateNextTeamKnockoutRoundAction.bind(null, tournament.id);
  const generateFinalPhaseBound = generateFinalPhaseFromPoolsAction.bind(null, tournament.id);
  const generateTeamFinalPhaseBound = generateTeamFinalPhaseFromPoolsAction.bind(null, tournament.id);
  const generateFinalPhaseFromStandingsBound = generateFinalPhaseFromStandingsAction.bind(
    null,
    tournament.id
  );
  const generateTeamFinalPhaseFromStandingsBound = generateTeamFinalPhaseFromStandingsAction.bind(
    null,
    tournament.id
  );
  const addRoundBound = addManualRoundAction.bind(null, tournament.id);

  const poolMatchesExist = tournament.rounds.some((r) => r.matches.some((m) => m.poolId));
  const finalPhaseExists = tournament.rounds.some((r) => r.matches.some((m) => !m.poolId));

  const mainPhaseRounds = tournament.rounds.filter((r) => !r.isFinalPhase);
  const mainPhaseComplete =
    mainPhaseRounds.length > 0 &&
    mainPhaseRounds.every((r) =>
      r.matches.every((m) => m.isBye || !m.homePlayerId || !m.awayPlayerId || m.status !== "SCHEDULED")
    );
  const finalPhaseFromStandingsExists = tournament.rounds.some((r) => r.isFinalPhase);

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
          Rondes — {tournament.name}
        </h1>
        {canManage && tournament.rounds.length > 0 && (
          <a
            href={`/api/tournois/${tournament.id}/rondes/export`}
            className="text-sm text-emerald-700 dark:text-emerald-400 underline"
          >
            Exporter les rondes en CSV
          </a>
        )}
      </div>

      {(tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") && (
        <FinalPhaseSettingsForm
          tournamentId={tournament.id}
          finalPhaseEnabled={tournament.finalPhaseEnabled}
          finalPhaseQualifiers={tournament.finalPhaseQualifiers}
          canManage={canManage}
        />
      )}

      {canManage && (
        <div className="flex flex-wrap gap-3 items-start">
          {tournament.isTeamEvent &&
            tournament.format === "ROUND_ROBIN" &&
            tournament.rounds.length === 0 && (
              <RoundActionButton
                action={generateTeamBound}
                label="Générer les rondes par équipes (round-robin)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {!tournament.isTeamEvent &&
            tournament.format === "ROUND_ROBIN" &&
            tournament.rounds.length === 0 && (
              <RoundActionButton
                action={generateBound}
                label="Générer les rondes (round-robin)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {!tournament.isTeamEvent && tournament.format === "SWISS" && (
            <RoundActionButton
              action={generateSwissBound}
              label="Générer la ronde suisse suivante"
              className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
            />
          )}
          {tournament.isTeamEvent && tournament.format === "SWISS" && (
            <RoundActionButton
              action={generateTeamSwissBound}
              label="Générer la ronde suisse suivante (équipes)"
              className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
            />
          )}
          {!tournament.isTeamEvent &&
            tournament.format === "GROUPS" &&
            tournament.rounds.length === 0 && (
              <RoundActionButton
                action={generatePoolsBound}
                label="Générer les rondes en poules"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {tournament.isTeamEvent &&
            tournament.format === "GROUPS" &&
            tournament.rounds.length === 0 && (
              <RoundActionButton
                action={generateTeamPoolsBound}
                label="Générer les rondes en poules (équipes)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {!tournament.isTeamEvent &&
            tournament.format === "GROUPS" &&
            poolMatchesExist &&
            !finalPhaseExists && (
              <RoundActionButton
                action={generateFinalPhaseBound}
                label="Générer la phase finale"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {tournament.isTeamEvent &&
            tournament.format === "GROUPS" &&
            poolMatchesExist &&
            !finalPhaseExists && (
              <RoundActionButton
                action={generateTeamFinalPhaseBound}
                label="Générer la phase finale (équipes)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {!tournament.isTeamEvent &&
            (tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") &&
            tournament.finalPhaseEnabled &&
            mainPhaseComplete &&
            !finalPhaseFromStandingsExists && (
              <RoundActionButton
                action={generateFinalPhaseFromStandingsBound}
                label="Générer la phase finale"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {tournament.isTeamEvent &&
            (tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") &&
            tournament.finalPhaseEnabled &&
            mainPhaseComplete &&
            !finalPhaseFromStandingsExists && (
              <RoundActionButton
                action={generateTeamFinalPhaseFromStandingsBound}
                label="Générer la phase finale (équipes)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {!tournament.isTeamEvent &&
            tournament.format === "KNOCKOUT" &&
            tournament.rounds.length === 0 && (
              <RoundActionButton
                action={generateKnockoutBound}
                label="Générer le tableau (élimination directe)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {!tournament.isTeamEvent &&
            ((tournament.format === "KNOCKOUT" && tournament.rounds.length > 0) ||
              (tournament.format === "GROUPS" && finalPhaseExists) ||
              ((tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") &&
                finalPhaseFromStandingsExists)) && (
              <RoundActionButton
                action={generateNextKnockoutBound}
                label="Générer le tour suivant"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {tournament.isTeamEvent &&
            tournament.format === "KNOCKOUT" &&
            tournament.rounds.length === 0 && (
              <RoundActionButton
                action={generateTeamKnockoutBound}
                label="Générer le tableau (élimination directe équipes)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          {tournament.isTeamEvent &&
            ((tournament.format === "KNOCKOUT" && tournament.rounds.length > 0) ||
              (tournament.format === "GROUPS" && finalPhaseExists) ||
              ((tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") &&
                finalPhaseFromStandingsExists)) && (
              <RoundActionButton
                action={generateNextTeamKnockoutBound}
                label="Générer le tour suivant (équipes)"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              />
            )}
          <RoundActionButton
            action={addRoundBound}
            label="+ Ajouter une ronde manuelle"
            className="rounded-md border border-black/10 dark:border-white/20 px-4 py-2 text-sm font-medium"
          />
        </div>
      )}

      {tournament.rounds.map((round) => {
        const roundHasPoolMatches = round.matches.some((m) => m.poolId);

        if (!tournament.isTeamEvent && tournament.format === "GROUPS" && roundHasPoolMatches) {
          // Tournoi en poules : regroupe les matchs de la ronde par poule
          // (chaque poule joue son propre round-robin interne). Une ronde
          // de la phase finale (générée à partir des qualifiés) n'a pas de
          // poule associée et tombe dans le rendu individuel classique.
          const byPool = new Map<string, { pool: Pool; matches: MatchWithRelations[] }>();
          for (const match of round.matches) {
            if (!match.pool) continue;
            if (!byPool.has(match.pool.id)) {
              byPool.set(match.pool.id, { pool: match.pool, matches: [] });
            }
            byPool.get(match.pool.id)!.matches.push(match);
          }

          return (
            <section key={round.id} className="flex flex-col gap-5">
              <h2 className="font-heading text-lg font-semibold">Ronde {round.number}</h2>
              {[...byPool.values()].map(({ pool, matches }) => (
                <div key={pool.id} className="flex flex-col gap-2">
                  <h3 className="font-medium text-sm">{pool.name}</h3>
                  <MatchTable
                    matches={matches}
                    canManage={canManage}
                    tournamentId={tournament.id}
                  />
                </div>
              ))}
              {byPool.size === 0 && (
                <p className="text-sm text-black/50 dark:text-white/50">
                  Aucun match dans cette ronde.
                </p>
              )}
            </section>
          );
        }

        if (!tournament.isTeamEvent) {
          const isKnockoutRound =
            tournament.format === "KNOCKOUT" ||
            tournament.format === "GROUPS" ||
            round.isFinalPhase;
          return (
            <section key={round.id} className="flex flex-col gap-3">
              <h2 className="font-heading text-lg font-semibold">
                {isKnockoutRound
                  ? getKnockoutStageLabel(countKnockoutEntrants(round.matches))
                  : `Ronde ${round.number}`}
              </h2>
              <MatchTable
                matches={round.matches}
                canManage={canManage}
                tournamentId={tournament.id}
              />
              {canManage && (
                <form
                  action={addMatchAction.bind(null, tournament.id, round.id)}
                  className="flex flex-wrap items-end gap-2"
                >
                  <select
                    name="homePlayerId"
                    required
                    className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
                  >
                    <option value="">Domicile...</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.lastName} {p.firstName}
                      </option>
                    ))}
                  </select>
                  <select
                    name="awayPlayerId"
                    required
                    className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
                  >
                    <option value="">Extérieur...</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.lastName} {p.firstName}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    name="table"
                    placeholder="Table"
                    className="w-20 rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded border border-black/10 dark:border-white/20 px-3 py-1.5 text-sm"
                  >
                    + Match
                  </button>
                </form>
              )}
            </section>
          );
        }

        if (tournament.format === "GROUPS" && roundHasPoolMatches) {
          // Tournoi par équipes en poules : regroupe d'abord par poule, puis
          // par confrontation d'équipes à l'intérieur de chaque poule. Une
          // ronde de la phase finale n'a pas de poule associée et tombe
          // dans le rendu par confrontation d'équipes classique.
          const byPool = new Map<
            string,
            {
              pool: Pool;
              encounters: Map<string, { homeTeam: Team; awayTeam: Team; matches: MatchWithRelations[] }>;
              byes: MatchWithRelations[];
            }
          >();

          for (const match of round.matches) {
            if (!match.pool) continue;
            if (!byPool.has(match.pool.id)) {
              byPool.set(match.pool.id, { pool: match.pool, encounters: new Map(), byes: [] });
            }
            const entry = byPool.get(match.pool.id)!;
            if (match.isBye) {
              entry.byes.push(match);
              continue;
            }
            if (!match.homeTeam || !match.awayTeam) continue;
            const key = `${match.homeTeam.id}:${match.awayTeam.id}`;
            if (!entry.encounters.has(key)) {
              entry.encounters.set(key, {
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                matches: [],
              });
            }
            entry.encounters.get(key)!.matches.push(match);
          }

          return (
            <section key={round.id} className="flex flex-col gap-6">
              <h2 className="font-heading text-lg font-semibold">Ronde {round.number}</h2>
              {[...byPool.values()].map(({ pool, encounters, byes }) => (
                <div key={pool.id} className="flex flex-col gap-4">
                  <h3 className="font-medium text-sm">{pool.name}</h3>
                  {[...encounters.values()].map(({ homeTeam, awayTeam, matches }) => (
                    <div key={`${homeTeam.id}:${awayTeam.id}`} className="flex flex-col gap-2 pl-4">
                      <p className="text-sm font-medium">
                        {homeTeam.name} vs {awayTeam.name}
                      </p>
                      <MatchTable
                        matches={matches}
                        canManage={canManage}
                        tournamentId={tournament.id}
                      />
                    </div>
                  ))}
                  {byes.map((match) => (
                    <p key={match.id} className="text-sm text-black/50 dark:text-white/50 pl-4">
                      {match.homeTeam?.name} : équipe exempte pour cette ronde.
                    </p>
                  ))}
                </div>
              ))}
              {byPool.size === 0 && (
                <p className="text-sm text-black/50 dark:text-white/50">
                  Aucun match dans cette ronde.
                </p>
              )}
            </section>
          );
        }

        // Tournoi par équipes : regroupe les échiquiers par confrontation
        // (paire d'équipes) et affiche à part les équipes exemptes.
        const encounters = new Map<
          string,
          { homeTeam: Team; awayTeam: Team; matches: MatchWithRelations[] }
        >();
        const byes: MatchWithRelations[] = [];

        for (const match of round.matches) {
          if (match.isBye) {
            byes.push(match);
            continue;
          }
          if (!match.homeTeam || !match.awayTeam) continue;
          const key = `${match.homeTeam.id}:${match.awayTeam.id}`;
          if (!encounters.has(key)) {
            encounters.set(key, {
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              matches: [],
            });
          }
          encounters.get(key)!.matches.push(match);
        }

        const isKnockoutRound =
          tournament.format === "KNOCKOUT" || tournament.format === "GROUPS" || round.isFinalPhase;
        return (
          <section key={round.id} className="flex flex-col gap-5">
            <h2 className="font-heading text-lg font-semibold">
              {isKnockoutRound
                ? getKnockoutStageLabel(countKnockoutEntrants(round.matches))
                : `Ronde ${round.number}`}
            </h2>

            {[...encounters.values()].map(({ homeTeam, awayTeam, matches }) => (
              <div key={`${homeTeam.id}:${awayTeam.id}`} className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">
                  {homeTeam.name} vs {awayTeam.name}
                </h3>
                <MatchTable
                  matches={matches}
                  canManage={canManage}
                  tournamentId={tournament.id}
                />
              </div>
            ))}

            {byes.map((match) => (
              <p key={match.id} className="text-sm text-black/50 dark:text-white/50">
                {match.homeTeam?.name} : équipe exempte pour cette ronde.
              </p>
            ))}

            {encounters.size === 0 && byes.length === 0 && (
              <p className="text-sm text-black/50 dark:text-white/50">
                Aucun match dans cette ronde.
              </p>
            )}
          </section>
        );
      })}

      {tournament.rounds.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          Aucune ronde créée. Générez un round-robin ou ajoutez une ronde manuelle.
        </p>
      )}
    </div>
  );
}
