"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Rafraîchit silencieusement une page serveur dès qu'une action pertinente
// est enregistrée pour ce tournoi (score, résultat de match...), en
// réutilisant le flux SSE public déjà utilisé par l'affichage grand écran —
// on ignore son contenu, il ne sert ici que de signal "quelque chose a
// changé". Les battements de cœur du flux (commentaires SSE) ne déclenchent
// pas onmessage, donc ça ne rafraîchit que sur un vrai changement.
export function LiveRefresh({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource(`/api/tournois/${tournamentId}/affichage/stream`);
    source.onmessage = () => {
      router.refresh();
    };
    return () => source.close();
  }, [tournamentId, router]);

  return null;
}
