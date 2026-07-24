"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavBarClient({
  session,
  isStaff,
  logoutAction,
}: {
  session: { name: string } | null;
  isStaff: boolean;
  logoutAction: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  // La page d'affichage grand écran est un mode kiosque plein écran : pas de
  // barre de navigation du site.
  if (pathname?.endsWith("/affichage")) return null;

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg">
          🀄 Scrabble Tournois
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/tournois" className="hover:underline">
            Tournois
          </Link>
          {isStaff && (
            <Link href="/admin" className="hover:underline">
              Espace organisateur
            </Link>
          )}
          {session ? (
            <>
              <span className="text-black/60 dark:text-white/60">{session.name}</span>
              <form action={logoutAction}>
                <button type="submit" className="hover:underline">
                  Déconnexion
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:underline">
                Connexion
              </Link>
              <Link href="/register" className="rounded-md bg-emerald-700 text-white px-3 py-1.5">
                Créer un compte
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
