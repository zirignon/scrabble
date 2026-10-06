"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";

const footerLinkClass =
  "text-sm text-black/60 dark:text-white/60 hover:text-navy dark:hover:text-navy-light hover:translate-x-0.5 transition-all inline-block";

export function Footer() {
  const pathname = usePathname();
  // Mode kiosque plein écran (voir NavBarClient) : pas de pied de page.
  if (pathname?.endsWith("/affichage")) return null;

  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/30">
      <div className="mx-auto max-w-5xl px-4 py-10 flex flex-col gap-8 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-2 max-w-xs">
          <Link
            href="/"
            className="flex items-center gap-2 font-heading font-semibold text-lg w-fit transition-transform hover:scale-[1.02]"
          >
            <Logo size={24} />
            Scrabble Tournois
          </Link>
          <p className="text-sm text-black/60 dark:text-white/60">
            Inscriptions, rondes, appariements et classements en direct pour
            vos tournois de Scrabble, classique et duplicate.
          </p>
        </div>

        <div className="flex flex-wrap gap-10 sm:gap-14">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
              Plateforme
            </span>
            <Link href="/tournois" className={footerLinkClass}>
              Tournois
            </Link>
            <Link href="/login" className={footerLinkClass}>
              Connexion
            </Link>
            <Link href="/register" className={footerLinkClass}>
              Créer un compte
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
              Formats
            </span>
            <span className="flex items-center gap-1.5 text-sm text-black/60 dark:text-white/60">
              <span className="w-1.5 h-1.5 rounded-full bg-moss dark:bg-moss-light" />
              Classique
            </span>
            <span className="flex items-center gap-1.5 text-sm text-black/60 dark:text-white/60">
              <span className="w-1.5 h-1.5 rounded-full bg-gold dark:bg-gold-light" />
              Duplicate
            </span>
          </div>
        </div>
      </div>
      <div className="border-t border-black/10 dark:border-white/10">
        <div className="mx-auto max-w-5xl px-4 py-4 text-xs text-black/50 dark:text-white/50">
          © {year} Scrabble Tournois. Tous droits réservés.
        </div>
      </div>
    </footer>
  );
}
