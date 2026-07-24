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
};

export default nextConfig;
