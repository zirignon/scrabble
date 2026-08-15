"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";

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

  const navLink = "rounded-full px-3.5 py-1.5 text-sm font-medium transition-all";
  const navLinkInactive =
    "text-black/70 dark:text-white/70 hover:bg-navy/10 hover:text-navy dark:hover:bg-navy-light/15 dark:hover:text-navy-light";
  const navLinkActive = "bg-navy text-white dark:bg-navy-light dark:text-navy shadow-sm shadow-navy/30";

  const isTournois = pathname === "/tournois" || pathname?.startsWith("/tournois/");
  const isAdmin = pathname?.startsWith("/admin");

  return (
    <header className="sticky top-0 z-40 border-b border-black/10 dark:border-white/10 bg-white/75 dark:bg-black/60 backdrop-blur-md shadow-sm shadow-black/[0.03] dark:shadow-black/20">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 font-heading font-semibold text-lg transition-transform hover:scale-[1.02]"
        >
          <Logo size={26} />
          Scrabble Tournois
        </Link>
        <nav className="flex items-center gap-1.5 text-sm">
          <Link
            href="/tournois"
            className={`${navLink} ${isTournois ? navLinkActive : navLinkInactive}`}
          >
            Tournois
          </Link>
          {isStaff && (
            <Link
              href="/admin"
              className={`${navLink} ${isAdmin ? navLinkActive : navLinkInactive}`}
            >
              Espace organisateur
            </Link>
          )}
          {session ? (
            <>
              <span className="ml-1 rounded-full bg-black/5 dark:bg-white/10 text-black/60 dark:text-white/70 px-3 py-1 text-xs font-medium">
                {session.name}
              </span>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className={`${navLink} text-black/70 dark:text-white/70 hover:bg-brick/10 hover:text-brick dark:hover:bg-brick-light/15 dark:hover:text-brick-light`}
                >
                  Déconnexion
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className={`${navLink} ${navLinkInactive}`}>
                Connexion
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-emerald-700 text-white px-3.5 py-1.5 text-sm font-medium shadow-sm shadow-emerald-900/20 hover:bg-emerald-800 hover:shadow-md hover:shadow-emerald-900/25 transition-all"
              >
                Créer un compte
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
