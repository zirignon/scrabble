import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import {
  addPoolMemberAction,
  createPoolAction,
  deletePoolAction,
  removePoolMemberAction,
} from "@/lib/actions/pools";

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
      pools: {
        orderBy: { createdAt: "asc" },
        include: { members: { include: { player: true }, orderBy: { id: "asc" } } },
      },
    },
  });
  if (!tournament || tournament.format !== "GROUPS") notFound();

  const canManage = canManageTournament(session, tournament.organizerId);
  const assignedPlayerIds = new Set(
    tournament.pools.flatMap((p) => p.members.map((m) => m.playerId))
  );
  const unassignedPlayers = tournament.registrations
    .map((r) => r.player)
    .filter((p) => !assignedPlayerIds.has(p.id));

  const createPoolBound = createPoolAction.bind(null, tournament.id);

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
          Poules — {tournament.name}
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          Chaque poule doit compter au moins 2 joueurs avant de générer les
          rondes (round-robin interne à chaque poule).
        </p>
      </div>

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
            <h2 className="text-lg font-semibold">
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
                    {member.player.firstName} {member.player.lastName}
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
                      {player.firstName} {player.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="rounded-md border border-black/10 dark:border-white/20 px-3 py-1.5 text-sm"
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
          {unassignedPlayers.map((p) => `${p.firstName} ${p.lastName}`).join(", ")}
        </p>
      )}
    </div>
  );
}
