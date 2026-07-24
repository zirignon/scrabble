"use client";

import { useEffect, useState } from "react";
import { computeLiveRemaining, formatClock } from "@/lib/timer";

export function LiveCountdown({
  baselineSeconds,
  runningSince,
  className,
}: {
  baselineSeconds: number;
  runningSince: string | null;
  className?: string;
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

  return <span className={className}>{formatClock(remaining)}</span>;
}
