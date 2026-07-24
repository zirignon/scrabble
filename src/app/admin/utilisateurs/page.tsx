import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guards";
import { updateUserRoleAction, resetUserPasswordAction } from "@/lib/actions/users";
import { UserForm } from "@/components/admin/UserForm";

const roleLabel: Record<string, string> = {
  ADMIN: "Administrateur",
  ORGANIZER: "Organisateur",
  REFEREE: "Arbitre",
  PLAYER: "Joueur",
};

export default async function AdminUsersPage() {
  await requireRole(["ADMIN"]);

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Utilisateurs</h1>
        <p className="text-sm text-black/60 dark:text-white/60 mb-4">
          Créez un compte pour un organisateur ou un arbitre — l&apos;inscription
          publique ne crée que des comptes joueurs, il n&apos;existe pas d&apos;auto-
          promotion.
        </p>
        <UserForm />
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pr-4">Nom</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Rôle</th>
            <th className="py-2 pr-4">Réinitialiser le mot de passe</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-black/5 dark:border-white/5">
              <td className="py-2 pr-4">{user.name}</td>
              <td className="py-2 pr-4">{user.email}</td>
              <td className="py-2 pr-4">
                <form
                  action={updateUserRoleAction.bind(null, user.id)}
                  className="flex items-center gap-2"
                >
                  <select
                    name="role"
                    defaultValue={user.role}
                    className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-xs"
                  >
                    {Object.entries(roleLabel).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded border border-black/10 dark:border-white/20 px-2 py-1 text-xs"
                  >
                    OK
                  </button>
                </form>
              </td>
              <td className="py-2 pr-4">
                <form
                  action={resetUserPasswordAction.bind(null, user.id)}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    name="password"
                    placeholder="Nouveau mot de passe"
                    minLength={8}
                    className="rounded border border-black/10 dark:border-white/20 px-2 py-1 bg-transparent text-xs w-40"
                  />
                  <button
                    type="submit"
                    className="rounded border border-black/10 dark:border-white/20 px-2 py-1 text-xs"
                  >
                    Changer
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-black/50 dark:text-white/50">
                Aucun utilisateur.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
