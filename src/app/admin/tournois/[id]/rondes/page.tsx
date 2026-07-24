import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import {
  addManualRoundAction,
  addMatchAction,
  generateKnockoutBracketAction,
  generateNextKnockoutRoundAction,
  generateNextSwissRoundAction,
  generateNextTeamKnockoutRoundAction,
  generateNextTeamSwissRoundAction,
  generatePoolsRoundRobinAction,
  generateRoundRobinAction,
  generateTeamKnockoutBracketAction,
  generateTeamPoolsRoundRobinAction,
  generateTeamRoundRobinAction,
  recordMatchResultAction,
} from "@/lib/actions/classic";
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
    <tr className="border-b border-black/5 dark:border-white/5">
      <td className="py-2 pr-4">{match.table ?? "—"}</td>
      <td className="py-2 pr-4">
        {match.homePlayer
          ? `${match.homePlayer.firstName} ${match.homePlayer.lastName}`
          : "—"}
      </td>
      <td className="py-2 pr-4">
        {match.isBye ? (
          <span className="text-black/50 dark:text-white/50">Exempt (bye)</span>
        ) : canManage ? (
          <form
            action={recordMatchResultAction.bind(null, tournamentId, match.id)}
            className="flex items-center gap-1"
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
      <td className="py-2 pr-4">
        {match.awayPlayer
          ? `${match.awayPlayer.firstName} ${match.awayPlayer.lastName}`
          : "—"}
      </td>
      <td className="py-2 pr-4">{statusLabel[match.status]}</td>
    </tr>
  );
}

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
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left border-b border-black/10 dark:border-white/10">
          <th className="py-2 pr-4">Table</th>
          <th className="py-2 pr-4">Domicile</th>
          <th className="py-2 pr-4">Score</th>
          <th className="py-2 pr-4">Extérieur</th>
          <th className="py-2 pr-4">Statut</th>
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
  const addRoundBound = addManualRoundAction.bind(null, tournament.id);

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

      {canManage && (
        <div className="flex gap-3">
          {tournament.isTeamEvent &&
            tournament.format === "ROUND_ROBIN" &&
            tournament.rounds.length === 0 && (
              <form action={generateTeamBound}>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
                >
                  Générer les rondes par équipes (round-robin)
                </button>
              </form>
            )}
          {!tournament.isTeamEvent &&
            tournament.format === "ROUND_ROBIN" &&
            tournament.rounds.length === 0 && (
              <form action={generateBound}>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
                >
                  Générer les rondes (round-robin)
                </button>
              </form>
            )}
          {!tournament.isTeamEvent && tournament.format === "SWISS" && (
            <form action={generateSwissBound}>
              <button
                type="submit"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              >
                Générer la ronde suisse suivante
              </button>
            </form>
          )}
          {tournament.isTeamEvent && tournament.format === "SWISS" && (
            <form action={generateTeamSwissBound}>
              <button
                type="submit"
                className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
              >
                Générer la ronde suisse suivante (équipes)
              </button>
            </form>
          )}
          {!tournament.isTeamEvent &&
            tournament.format === "GROUPS" &&
            tournament.rounds.length === 0 && (
              <form action={generatePoolsBound}>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
                >
                  Générer les rondes en poules
                </button>
              </form>
            )}
          {tournament.isTeamEvent &&
            tournament.format === "GROUPS" &&
            tournament.rounds.length === 0 && (
              <form action={generateTeamPoolsBound}>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
                >
                  Générer les rondes en poules (équipes)
                </button>
              </form>
            )}
          {!tournament.isTeamEvent &&
            tournament.format === "KNOCKOUT" &&
            tournament.rounds.length === 0 && (
              <form action={generateKnockoutBound}>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
                >
                  Générer le tableau (élimination directe)
                </button>
              </form>
            )}
          {!tournament.isTeamEvent &&
            tournament.format === "KNOCKOUT" &&
            tournament.rounds.length > 0 && (
              <form action={generateNextKnockoutBound}>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
                >
                  Générer le tour suivant
                </button>
              </form>
            )}
          {tournament.isTeamEvent &&
            tournament.format === "KNOCKOUT" &&
            tournament.rounds.length === 0 && (
              <form action={generateTeamKnockoutBound}>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
                >
                  Générer le tableau (élimination directe équipes)
                </button>
              </form>
            )}
          {tournament.isTeamEvent &&
            tournament.format === "KNOCKOUT" &&
            tournament.rounds.length > 0 && (
              <form action={generateNextTeamKnockoutBound}>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
                >
                  Générer le tour suivant (équipes)
                </button>
              </form>
            )}
          <form action={addRoundBound}>
            <button
              type="submit"
              className="rounded-md border border-black/10 dark:border-white/20 px-4 py-2 text-sm font-medium"
            >
              + Ajouter une ronde manuelle
            </button>
          </form>
        </div>
      )}

      {tournament.rounds.map((round) => {
        if (!tournament.isTeamEvent && tournament.format === "GROUPS") {
          // Tournoi en poules : regroupe les matchs de la ronde par poule
          // (chaque poule joue son propre round-robin interne).
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
              <h2 className="text-lg font-semibold">Ronde {round.number}</h2>
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
          return (
            <section key={round.id} className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Ronde {round.number}</h2>
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
                        {p.firstName} {p.lastName}
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
                        {p.firstName} {p.lastName}
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

        if (tournament.format === "GROUPS") {
          // Tournoi par équipes en poules : regroupe d'abord par poule, puis
          // par confrontation d'équipes à l'intérieur de chaque poule.
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
              <h2 className="text-lg font-semibold">Ronde {round.number}</h2>
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

        return (
          <section key={round.id} className="flex flex-col gap-5">
            <h2 className="text-lg font-semibold">Ronde {round.number}</h2>

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
