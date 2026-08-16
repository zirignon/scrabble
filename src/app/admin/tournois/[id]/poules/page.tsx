import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import {
  addPoolMemberAction,
  assignTeamToPoolAction,
  createPoolAction,
  deletePoolAction,
  removePoolMemberAction,
  removeTeamFromPoolAction,
  updateQualifiersPerPoolAction,
} from "@/lib/actions/pools";

function QualifiersSettingsForm({
  tournamentId,
  qualifiersPerPool,
  canManage,
}: {
  tournamentId: string;
  qualifiersPerPool: number;
  canManage: boolean;
}) {
  return (
    <div className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 flex flex-col gap-2">
      <p className="text-sm font-medium">Phase finale</p>
      {canManage ? (
        <form
          action={updateQualifiersPerPoolAction.bind(null, tournamentId)}
          className="flex items-end gap-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="qualifiersPerPool" className="text-xs font-medium">
              Qualifiés par poule
            </label>
            <input
              id="qualifiersPerPool"
              name="qualifiersPerPool"
              type="number"
              min={1}
              defaultValue={qualifiersPerPool}
              className="w-24 rounded-md border-2 border-gold/40 dark:border-gold-light/40 px-3 py-2 bg-gold/10 dark:bg-gold-light/10 font-semibold text-navy dark:text-gold-light text-sm focus:border-gold dark:focus:border-gold-light focus:bg-gold/20 dark:focus:bg-gold-light/20 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-navy hover:bg-navy/90 text-white dark:bg-navy-light dark:hover:bg-navy-light/90 dark:text-navy px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Mettre à jour
          </button>
        </form>
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          {qualifiersPerPool} qualifié(s) par poule.
        </p>
      )}
      <p className="text-xs text-black/50 dark:text-white/50">
        Une fois la phase de poules terminée, générez la phase finale
        (élimination directe) depuis la page des rondes.
      </p>
    </div>
  );
}

export default async function PoolsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole(STAFF_ROLES);

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      registrations: { include: { player: true }, orderBy: { createdAt: "asc" } },
      teams: { orderBy: { createdAt: "asc" } },
      pools: {
        orderBy: { createdAt: "asc" },
        include: {
          members: { include: { player: true }, orderBy: { id: "asc" } },
          teams: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!tournament || tournament.format !== "GROUPS") notFound();

  const canManage = canManageTournament(session, tournament.organizerId);
  const createPoolBound = createPoolAction.bind(null, tournament.id);

  if (tournament.isTeamEvent) {
    const unassignedTeams = tournament.teams.filter((t) => !t.poolId);

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
            Poules — {tournament.name}
          </h1>
          <p className="text-sm text-black/60 dark:text-white/60 mt-1">
            Chaque poule doit compter au moins 2 équipes avant de générer les
            rondes. Créez les équipes sur la page « Équipes » avant de les
            affecter ici.
          </p>
          <Link
            href={`/tournois/${tournament.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-emerald-700 dark:text-emerald-400 underline mt-1 inline-block"
          >
            Voir la page publique ↗
          </Link>
        </div>

        <QualifiersSettingsForm
          tournamentId={tournament.id}
          qualifiersPerPool={tournament.qualifiersPerPool}
          canManage={canManage}
        />

        {canManage && (
          <form action={createPoolBound} className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="name" className="text-xs font-medium">
                Nouvelle poule
              </label>
              <input
                id="name"
                name="name"
                required
                placeholder="Nom de la poule"
                className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
            >
              + Créer la poule
            </button>
          </form>
        )}

        {tournament.pools.map((pool) => (
          <section key={pool.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold">
                {pool.name}
                <span className="ml-2 text-sm font-normal text-black/60 dark:text-white/60">
                  {pool.teams.length} équipe(s)
                </span>
              </h2>
              {canManage && (
                <form action={deletePoolAction.bind(null, tournament.id, pool.id)}>
                  <button type="submit" className="text-sm text-red-600 hover:underline">
                    Supprimer la poule
                  </button>
                </form>
              )}
            </div>

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pr-4">Équipe</th>
                  {canManage && <th className="py-2 pr-4" />}
                </tr>
              </thead>
              <tbody>
                {pool.teams.map((team) => (
                  <tr key={team.id} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-4">{team.name}</td>
                    {canManage && (
                      <td className="py-2 pr-4 text-right">
                        <form
                          action={removeTeamFromPoolAction.bind(null, tournament.id, team.id)}
                        >
                          <button type="submit" className="text-red-600 hover:underline">
                            Retirer
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
                {pool.teams.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-2 text-black/50 dark:text-white/50">
                      Aucune équipe dans cette poule.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {canManage && (
              <form
                action={assignTeamToPoolAction.bind(null, tournament.id, pool.id)}
                className="flex items-end gap-3"
              >
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Ajouter une équipe</label>
                  <select
                    name="teamId"
                    required
                    className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm min-w-64"
                  >
                    <option value="">Sélectionner...</option>
                    {unassignedTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="rounded-md bg-gold hover:bg-gold/90 text-white dark:bg-gold-light dark:hover:bg-gold-light/90 dark:text-navy px-3 py-1.5 text-sm font-medium transition-colors"
                >
                  + Ajouter
                </button>
              </form>
            )}
          </section>
        ))}

        {tournament.pools.length === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            Aucune poule créée pour le moment.
          </p>
        )}

        {unassignedTeams.length > 0 && tournament.pools.length > 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            Équipes non encore affectées à une poule :{" "}
            {unassignedTeams.map((t) => t.name).join(", ")}
          </p>
        )}
      </div>
    );
  }

  const assignedPlayerIds = new Set(
    tournament.pools.flatMap((p) => p.members.map((m) => m.playerId))
  );
  const unassignedPlayers = tournament.registrations
    .map((r) => r.player)
    .filter((p) => !assignedPlayerIds.has(p.id));

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
          Poules — {tournament.name}
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          Chaque poule doit compter au moins 2 joueurs avant de générer les
          rondes (round-robin interne à chaque poule).
        </p>
        <Link
          href={`/tournois/${tournament.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-emerald-700 dark:text-emerald-400 underline mt-1 inline-block"
        >
          Voir la page publique ↗
        </Link>
      </div>

      <QualifiersSettingsForm
        tournamentId={tournament.id}
        qualifiersPerPool={tournament.qualifiersPerPool}
        canManage={canManage}
      />

      {canManage && (
        <form action={createPoolBound} className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-xs font-medium">
              Nouvelle poule
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="Nom de la poule"
              className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
          >
            + Créer la poule
          </button>
        </form>
      )}

      {tournament.pools.map((pool) => (
        <section key={pool.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold">
              {pool.name}
              <span className="ml-2 text-sm font-normal text-black/60 dark:text-white/60">
                {pool.members.length} joueur(s)
              </span>
            </h2>
            {canManage && (
              <form action={deletePoolAction.bind(null, tournament.id, pool.id)}>
                <button type="submit" className="text-sm text-red-600 hover:underline">
                  Supprimer la poule
                </button>
              </form>
            )}
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-black/10 dark:border-white/10">
                <th className="py-2 pr-4">Joueur</th>
                {canManage && <th className="py-2 pr-4" />}
              </tr>
            </thead>
            <tbody>
              {pool.members.map((member) => (
                <tr key={member.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-4">
                    {member.player.lastName} {member.player.firstName}
                  </td>
                  {canManage && (
                    <td className="py-2 pr-4 text-right">
                      <form
                        action={removePoolMemberAction.bind(null, tournament.id, member.id)}
                      >
                        <button type="submit" className="text-red-600 hover:underline">
                          Retirer
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {pool.members.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-2 text-black/50 dark:text-white/50">
                    Aucun joueur dans cette poule.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {canManage && (
            <form
              action={addPoolMemberAction.bind(null, tournament.id, pool.id)}
              className="flex items-end gap-3"
            >
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Ajouter un joueur</label>
                <select
                  name="playerId"
                  required
                  className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm min-w-64"
                >
                  <option value="">Sélectionner...</option>
                  {unassignedPlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.lastName} {player.firstName}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="rounded-md bg-gold hover:bg-gold/90 text-white dark:bg-gold-light dark:hover:bg-gold-light/90 dark:text-navy px-3 py-1.5 text-sm font-medium transition-colors"
              >
                + Ajouter
              </button>
            </form>
          )}
        </section>
      ))}

      {tournament.pools.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          Aucune poule créée pour le moment.
        </p>
      )}

      {unassignedPlayers.length > 0 && tournament.pools.length > 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          Joueurs inscrits non encore affectés à une poule :{" "}
          {unassignedPlayers.map((p) => `${p.lastName} ${p.firstName}`).join(", ")}
        </p>
      )}
    </div>
  );
}
