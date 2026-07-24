// Temps restant "en direct" d'un chronomètre serveur-autoritaire : le
// serveur ne stocke qu'un temps restant figé (baseline) et l'instant du
// dernier démarrage ; le client (ou le serveur au rendu) recalcule le
// temps réellement écoulé depuis ce départ.
export function computeLiveRemaining(
  baselineSeconds: number,
  runningSince: Date | string | null
): number {
  if (!runningSince) return Math.max(0, baselineSeconds);
  const startedAt = typeof runningSince === "string" ? new Date(runningSince) : runningSince;
  const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  return Math.max(0, baselineSeconds - elapsed);
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
