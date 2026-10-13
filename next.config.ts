import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  // L'import du dictionnaire (ODS9 : plusieurs Mo en texte brut) passe par
  // une Server Action ; la limite par défaut (1 Mo) est trop basse pour ça.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // En-têtes de sécurité de base, recommandés par Next.js (voir
  // node_modules/next/dist/docs/.../next-config-js/headers.md), appliqués à
  // toutes les routes. N'inclut volontairement pas de Content-Security-Policy :
  // une CSP correcte nécessite un audit complet des scripts/styles
  // (hydratation Next.js, polices next/font, Tailwind) et des nonces par
  // requête pour ne pas casser l'affichage — à traiter séparément plutôt que
  // d'en déployer une mal calibrée.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
