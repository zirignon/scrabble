import { prisma } from "@/lib/prisma";
import { deleteClubAction } from "@/lib/actions/clubs";
import { ClubForm } from "@/components/admin/ClubForm";

export default async function AdminClubsPage() {
  const clubs = await prisma.club.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { players: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold mb-4">Clubs</h1>
        <ClubForm />
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pr-4">Nom</th>
            <th className="py-2 pr-4">Ville</th>
            <th className="py-2 pr-4">Joueurs</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {clubs.map((club) => (
            <tr key={club.id} className="border-b border-black/5 dark:border-white/5">
              <td className="py-2 pr-4">{club.name}</td>
              <td className="py-2 pr-4">{club.city ?? "—"}</td>
              <td className="py-2 pr-4">{club._count.players}</td>
              <td className="py-2 pr-4 text-right">
                <form action={deleteClubAction.bind(null, club.id)}>
                  <button type="submit" className="text-red-600 hover:underline">
                    Supprimer
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {clubs.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-black/50 dark:text-white/50">
                Aucun club pour le moment.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
