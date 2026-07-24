import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, canManageTournament, STAFF_ROLES } from "@/lib/guards";
import {
  registerPlayerAction,
  unregisterPlayerAction,
  updateTournamentStatusFormAction,
} from "@/lib/actions/tournaments";
import { DeleteTournamentButton } from "@/components/admin/DeleteTournamentButton";

const statusOptions = [
  ["DRAFT", "Brouillon"],
  ["REGISTRATION_OPEN", "Inscriptions ouvertes"],
  ["REGISTRATION_CLOSED", "Inscriptions fermées"],
  ["IN_PROGRESS", "En cours"],
  ["COMPLETED", "Terminé"],
  ["ARCHIVED", "Archivé"],
] as const;

export default async function ManageTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireRole(STAFF_ROLES);

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      registrations: {
        include: { player: { include: { club: true } } },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { rounds: true, games: true, teams: true, pools: true } },
    },
  });
  if (!tournament) notFound();

  const canManage = canManageTournament(session, tournament.organizerId);

  const registeredIds = new Set(tournament.registrations.map((r) => r.playerId));
  const availablePlayers = await prisma.player.findMany({
    where: { id: { notIn: [...registeredIds] } },
    orderBy: [{ lastName: "asc" }],
  });

  const registerBound = registerPlayerAction.bind(null, tournament.id);
  const statusBound = updateTournamentStatusFormAction.bind(null, tournament.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm text-black/50 dark:text-white/50">
          {tournament.type === "CLASSIC" ? "Scrabble classique" : "Scrabble duplicate"}
        </p>
        <h1 className="text-2xl font-semibold">{tournament.name}</h1>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          <Link href={`/tournois/${tournament.slug}`} className="underline">
            Voir la page publique
          </Link>
        </p>
      </div>

      {canManage && (
        <div className="flex items-center gap-3">
          <form action={statusBound} className="flex items-center gap-2">
            <label htmlFor="status" className="text-sm font-medium">
              Statut
            </label>
            <select
              id="status"
              name="status"
              defaultValue={tournament.status}
              className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm"
            >
              {statusOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-emerald-700 text-white px-3 py-2 text-sm font-medium"
            >
              Mettre à jour
            </button>
          </form>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Inscriptions ({tournament.registrations.length})</h2>

        {canManage && (
          <form action={registerBound} className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="playerId" className="text-xs font-medium">
                Ajouter un joueur
              </label>
              <select
                id="playerId"
                name="playerId"
                required
                className="rounded-md border border-black/10 dark:border-white/20 px-3 py-2 bg-transparent text-sm min-w-64"
              >
                <option value="">Sélectionner...</option>
                {availablePlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.firstName} {player.lastName}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
            >
              Inscrire
            </button>
          </form>
        )}

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="py-2 pr-4">Joueur</th>
              <th className="py-2 pr-4">Club</th>
              <th className="py-2 pr-4">Statut</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {tournament.registrations.map((reg) => (
              <tr key={reg.id} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-4">
                  {reg.player.firstName} {reg.player.lastName}
                </td>
                <td className="py-2 pr-4">{reg.player.club?.name ?? "—"}</td>
                <td className="py-2 pr-4">{reg.status}</td>
                <td className="py-2 pr-4 text-right">
                  {canManage && (
                    <form
                      action={unregisterPlayerAction.bind(
                        null,
                        tournament.id,
                        reg.playerId
                      )}
                    >
                      <button type="submit" className="text-red-600 hover:underline">
                        Retirer
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {tournament.registrations.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-black/50 dark:text-white/50">
                  Aucun joueur inscrit.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3">
        {tournament.isTeamEvent && (
          <Link
            href={`/admin/tournois/${tournament.id}/equipes`}
            className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 hover:bg-black/[.02] dark:hover:bg-white/[.04]"
          >
            <p className="font-medium">Gérer les équipes</p>
            <p className="text-xs text-black/60 dark:text-white/60">
              {tournament._count.teams} équipe(s) créée(s)
            </p>
          </Link>
        )}
        {tournament.type === "CLASSIC" && tournament.format === "GROUPS" && (
          <Link
            href={`/admin/tournois/${tournament.id}/poules`}
            className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 hover:bg-black/[.02] dark:hover:bg-white/[.04]"
          >
            <p className="font-medium">Gérer les poules</p>
            <p className="text-xs text-black/60 dark:text-white/60">
              {tournament._count.pools} poule(s) créée(s)
            </p>
          </Link>
        )}
        {tournament.type === "CLASSIC" ? (
          <Link
            href={`/admin/tournois/${tournament.id}/rondes`}
            className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 hover:bg-black/[.02] dark:hover:bg-white/[.04]"
          >
            <p className="font-medium">Gérer les rondes et résultats</p>
            <p className="text-xs text-black/60 dark:text-white/60">
              {tournament._count.rounds} ronde(s) créée(s)
            </p>
          </Link>
        ) : (
          <Link
            href={`/admin/tournois/${tournament.id}/parties`}
            className="rounded-md border border-black/10 dark:border-white/20 px-4 py-3 hover:bg-black/[.02] dark:hover:bg-white/[.04]"
          >
            <p className="font-medium">Gérer les parties et scores</p>
            <p className="text-xs text-black/60 dark:text-white/60">
              {tournament._count.games} partie(s) créée(s)
            </p>
          </Link>
        )}
      </section>

      {canManage && (
        <section className="flex flex-col gap-3 rounded-md border border-red-600/30 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-red-600">Zone dangereuse</h2>
            <p className="text-xs text-black/60 dark:text-white/60 mt-1">
              Supprime définitivement ce tournoi et toutes ses données
              (inscriptions, rondes/matchs, équipes, poules, parties). Aucun
              retour en arrière possible.
            </p>
          </div>
          <DeleteTournamentButton
            tournamentId={tournament.id}
            tournamentName={tournament.name}
          />
        </section>
      )}
    </div>
  );
}
