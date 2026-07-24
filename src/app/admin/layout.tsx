import Link from "next/link";
import { requireRole, STAFF_ROLES } from "@/lib/guards";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(STAFF_ROLES);

  return (
    <div className="mx-auto max-w-5xl w-full px-4 py-8 flex flex-col gap-6">
      <nav className="flex flex-wrap gap-4 text-sm border-b border-black/10 dark:border-white/10 pb-3">
        <Link href="/admin" className="hover:underline font-medium">
          Tableau de bord
        </Link>
        <Link href="/admin/tournois/nouveau" className="hover:underline">
          Créer un tournoi
        </Link>
        <Link href="/admin/joueurs" className="hover:underline">
          Joueurs
        </Link>
        <Link href="/admin/clubs" className="hover:underline">
          Clubs
        </Link>
      </nav>
      {children}
    </div>
  );
}
