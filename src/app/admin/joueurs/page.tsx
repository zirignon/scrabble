import { prisma } from "@/lib/prisma";
import { deletePlayerAction } from "@/lib/actions/players";
import { PlayerForm } from "@/components/admin/PlayerForm";

export default async function AdminPlayersPage() {
  const [players, clubs] = await Promise.all([
    prisma.player.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: { club: true },
    }),
    prisma.club.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Joueurs</h1>
          <a
            href="/api/joueurs/export"
            className="rounded-md border border-black/10 dark:border-white/20 px-3 py-1.5 text-sm"
          >
            Exporter en CSV
          </a>
        </div>
        <PlayerForm clubs={clubs} />
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pr-4">Nom</th>
            <th className="py-2 pr-4">Club</th>
            <th className="py-2 pr-4">Licence</th>
            <th className="py-2 pr-4">Catégorie</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.id} className="border-b border-black/5 dark:border-white/5">
              <td className="py-2 pr-4">
                {player.firstName} {player.lastName}
              </td>
              <td className="py-2 pr-4">{player.club?.name ?? "—"}</td>
              <td className="py-2 pr-4">{player.licenseNumber ?? "—"}</td>
              <td className="py-2 pr-4">{player.category ?? "—"}</td>
              <td className="py-2 pr-4 text-right">
                <form action={deletePlayerAction.bind(null, player.id)}>
                  <button type="submit" className="text-red-600 hover:underline">
                    Supprimer
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {players.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-black/50 dark:text-white/50">
                Aucun joueur pour le moment.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
