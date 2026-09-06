import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import {
  addTeamMemberAction,
  createTeamAction,
  deleteTeamAction,
  removeTeamMemberAction,
} from "@/lib/actions/teams";
import { PlayerSearchSelect } from "@/components/admin/PlayerSearchSelect";

export default async function TeamsPage({
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
      teams: {
        orderBy: { createdAt: "asc" },
        include: { members: { include: { player: true }, orderBy: { board: "asc" } } },
      },
    },
  });
  if (!tournament || !tournament.isTeamEvent) notFound();

  const canManage = canManageTournament(session, tournament.organizerId);
  const assignedPlayerIds = new Set(
    tournament.teams.flatMap((t) => t.members.map((m) => m.playerId))
  );
  const unassignedPlayers = tournament.registrations
    .map((r) => r.player)
    .filter((p) => !assignedPlayerIds.has(p.id));

  const createTeamBound = createTeamAction.bind(null, tournament.id);

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
          Équipes — {tournament.name}
        </h1>
        <Link
          href={`/tournois/${tournament.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-emerald-700 dark:text-emerald-400 underline mt-1 inline-block"
        >
          Voir la page publique ↗
        </Link>
      </div>

      {canManage && (
        <form action={createTeamBound} className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-xs font-medium">
              Nouvelle équipe
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="Nom de l'équipe"
              className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
          >
            + Créer l&apos;équipe
          </button>
        </form>
      )}

      {tournament.teams.map((team) => (
        <section key={team.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold">
              {team.name}
              <span className="ml-2 text-sm font-normal text-black/60 dark:text-white/60">
                {team.members.length} joueur(s)
              </span>
            </h2>
            {canManage && (
              <form action={deleteTeamAction.bind(null, tournament.id, team.id)}>
                <button
                  type="submit"
                  className="text-sm text-red-600 hover:underline"
                >
                  Supprimer l&apos;équipe
                </button>
              </form>
            )}
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-black/10 dark:border-white/10">
                <th className="py-2 pr-4">Échiquier</th>
                <th className="py-2 pr-4">Joueur</th>
                {canManage && <th className="py-2 pr-4" />}
              </tr>
            </thead>
            <tbody>
              {team.members.map((member) => (
                <tr key={member.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-4">{member.board}</td>
                  <td className="py-2 pr-4">
                    {member.player.lastName} {member.player.firstName}
                  </td>
                  {canManage && (
                    <td className="py-2 pr-4 text-right">
                      <form
                        action={removeTeamMemberAction.bind(
                          null,
                          tournament.id,
                          member.id
                        )}
                      >
                        <button type="submit" className="text-red-600 hover:underline">
                          Retirer
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {team.members.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-2 text-black/50 dark:text-white/50">
                    Aucun joueur dans cette équipe.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {canManage && (
            <PlayerSearchSelect
              key={team.members.length}
              tournamentId={tournament.id}
              context="team"
              label="Ajouter un joueur (nom ou licence)"
              submitLabel="+ Ajouter"
              action={addTeamMemberAction.bind(null, tournament.id, team.id)}
            />
          )}
        </section>
      ))}

      {tournament.teams.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          Aucune équipe créée pour le moment.
        </p>
      )}

      {unassignedPlayers.length > 0 && tournament.teams.length > 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          Joueurs inscrits non encore affectés à une équipe :{" "}
          {unassignedPlayers.map((p) => `${p.lastName} ${p.firstName}`).join(", ")}
        </p>
      )}
    </div>
  );
}
