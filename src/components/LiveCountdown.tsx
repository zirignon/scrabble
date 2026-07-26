"use client";

import { useEffect, useState } from "react";
import { computeLiveRemaining, formatClock } from "@/lib/timer";

export function LiveCountdown({
  baselineSeconds,
  runningSince,
  className,
  alertSeconds,
}: {
  baselineSeconds: number;
  runningSince: string | null;
  className?: string;
  // Repère d'alerte (règlement FISF §3.3, "trente (ou vingt) secondes") :
  // au-delà de ce seuil de secondes restantes, le décompte est mis en
  // évidence pendant que le chrono tourne.
  alertSeconds?: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!runningSince) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [runningSince]);

  const remaining = runningSince
    ? computeLiveRemaining(baselineSeconds, runningSince)
    : baselineSeconds;
  // `now` n'est lu qu'ici pour forcer le recalcul à chaque tick.
  void now;

  const isAlert = Boolean(runningSince) && alertSeconds !== undefined && remaining <= alertSeconds;

  // Un style inline (plutôt qu'une classe Tailwind supplémentaire) garantit
  // que la couleur d'alerte l'emporte sur celle du className passé par
  // l'appelant, quel que soit l'ordre des règles dans la feuille de style
  // compilée.
  return (
    <span className={className} style={isAlert ? { color: "var(--color-brick)" } : undefined}>
      {formatClock(remaining)}
    </span>
  );
}
