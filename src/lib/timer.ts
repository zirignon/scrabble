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

// Interprète une durée saisie au format "minutes:secondes" (ex. "2:30") ou,
// pour rester compatible avec l'ancienne saisie, un simple nombre de
// minutes (ex. "3" ou "2.5"). Renvoie le nombre de secondes correspondant,
// ou null si la saisie n'est pas valide.
export function parseClock(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+):([0-5]?\d)$/);
  if (match) {
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    return minutes * 60 + seconds;
  }

  const asMinutes = Number(trimmed);
  if (Number.isFinite(asMinutes) && asMinutes > 0) {
    return Math.round(asMinutes * 60);
  }
  return null;
}
