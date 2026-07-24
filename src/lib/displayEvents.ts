import "server-only";

// Registre en mémoire (process unique) des abonnés à l'affichage grand
// écran d'un tournoi : les server actions appellent notifyTournamentUpdate
// après chaque mutation pertinente (score, ronde, chrono...) pour que le
// flux SSE de /api/tournois/[id]/affichage/stream pousse aussitôt les
// données fraîches, sans attendre le prochain sondage.
//
// Stocké sur `globalThis` (comme le client Prisma) car Next.js peut
// compiler les server actions et les route handlers dans des bundles
// distincts : un simple module-level Map ne serait alors pas partagé
// entre l'action qui notifie et la route qui écoute.
const globalForDisplayEvents = globalThis as unknown as {
  displayEventSubscribers: Map<string, Set<() => void>> | undefined;
};

const subscribers =
  globalForDisplayEvents.displayEventSubscribers ?? new Map<string, Set<() => void>>();
globalForDisplayEvents.displayEventSubscribers = subscribers;

export function subscribeTournamentUpdates(tournamentId: string, callback: () => void): () => void {
  const set = subscribers.get(tournamentId) ?? new Set();
  set.add(callback);
  subscribers.set(tournamentId, set);

  return () => {
    set.delete(callback);
    if (set.size === 0) subscribers.delete(tournamentId);
  };
}

export function notifyTournamentUpdate(tournamentId: string): void {
  const set = subscribers.get(tournamentId);
  if (!set) return;
  for (const callback of set) callback();
}
