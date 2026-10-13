import { NextRequest, NextResponse } from "next/server";

// CSP par nonce (voir node_modules/next/dist/docs/.../content-security-policy.md) :
// un nonce aléatoire par requête autorise les scripts que Next.js injecte
// lui-même (hydratation React, bundles de page) tout en bloquant tout script
// injecté par un tiers (XSS) qui ne peut pas deviner ce nonce. Toutes les
// pages de ce site sont déjà rendues dynamiquement (aucune route statique,
// voir la sortie de `next build`), donc aucune perte d'optimisation statique
// liée à l'usage de nonces ici.
//
// style-src autorise 'unsafe-inline' SANS nonce (volontairement, pas un
// oubli) : quelques composants (ScrabbleGrid, DisplayBoard, la page
// d'accueil) utilisent l'attribut HTML style="..." pour des couleurs/tailles
// calculées dynamiquement — un attribut style ne peut pas porter de nonce
// (seules les balises <style>/<link> le peuvent, selon la spec CSP), et la
// présence d'un nonce sur style-src ferait ignorer 'unsafe-inline' par les
// navigateurs qui le supportent, cassant ces composants. Compromis courant
// et documenté : le risque XSS par script reste bloqué (directive la plus
// sensible), seul le style inline reste permissif.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'self';
    ${isDev ? "" : "upgrade-insecure-requests;"}
  `;
  const contentSecurityPolicyHeaderValue = cspHeader
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);

  return response;
}

export const config = {
  matcher: [
    // Toutes les routes sauf les routes API, les fichiers statiques Next et
    // le favicon — voir le commentaire équivalent dans la doc Next.js : la
    // CSP concerne le rendu HTML/scripts, pas les réponses JSON/fichiers des
    // routes API (déjà couvertes par les en-têtes de next.config.ts).
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
