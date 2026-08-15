import type { Metadata } from "next";
import { Fraunces, Work_Sans } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/layout/NavBar";
import { ScrollToTopButton } from "@/components/layout/ScrollToTopButton";
import { Logo } from "@/components/Logo";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const workSans = Work_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Scrabble Tournois",
  description:
    "Plateforme de gestion de tournois de Scrabble classique et duplicate",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${fraunces.variable} ${workSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-emerald-50 dark:bg-emerald-950/20">
        <div
          className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
          aria-hidden="true"
        >
          <svg
            className="absolute inset-0 h-full w-full text-navy dark:text-navy-light"
          >
            <defs>
              <pattern
                id="tile-grid"
                width="34"
                height="34"
                patternUnits="userSpaceOnUse"
              >
                <rect
                  x="1"
                  y="1"
                  width="28"
                  height="28"
                  rx="4"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.08"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#tile-grid)" />
          </svg>
          <Logo
            size={260}
            className="absolute -right-12 -top-12 opacity-[0.05] dark:opacity-[0.08] hidden sm:block"
          />
        </div>
        <NavBar />
        <main className="flex-1 flex flex-col">{children}</main>
        <ScrollToTopButton />
      </body>
    </html>
  );
}
