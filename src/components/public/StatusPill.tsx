// Styles et pastilles de statut partagés par les pages publiques de tournoi
// (rondes, parties, participants, classement).
export const headRow = "text-left border-b-2 border-navy/20 dark:border-navy-light/30";
export const th = "py-2.5 pr-4 text-xs font-semibold uppercase tracking-wide text-black/45 dark:text-white/50";
export const exportLink = "text-sm text-navy dark:text-navy-light underline underline-offset-2";

export const matchRow = "border-b border-black/5 dark:border-white/5 hover:bg-navy/[0.035] dark:hover:bg-white/[0.05] transition-colors";
export const matchCell = "py-2 pr-4";
export const scoreCell = "py-2 pr-4 font-semibold tabular-nums";

const matchStatusLabel: Record<string, string> = {
  SCHEDULED: "À jouer",
  PLAYED: "Joué",
  FORFEIT_HOME: "Forfait (domicile)",
  FORFEIT_AWAY: "Forfait (extérieur)",
  CANCELLED: "Annulé",
};

const pillClass = {
  moss: "bg-moss/10 text-moss dark:bg-moss-light/15 dark:text-moss-light",
  gold: "bg-gold/10 text-gold dark:bg-gold-light/15 dark:text-gold-light",
  brick: "bg-brick/10 text-brick dark:bg-brick-light/15 dark:text-brick-light",
  muted: "bg-black/5 text-black/50 dark:bg-white/10 dark:text-white/50",
} as const;

export function Pill({
  tone,
  children,
}: {
  tone: keyof typeof pillClass;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${pillClass[tone]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function MatchStatusPill({ status, isBye }: { status: string; isBye: boolean }) {
  if (isBye) return <Pill tone="muted">Exempt</Pill>;
  if (status === "PLAYED") return <Pill tone="moss">Joué</Pill>;
  if (status === "SCHEDULED") return <Pill tone="gold">À jouer</Pill>;
  if (status === "CANCELLED") return <Pill tone="muted">Annulé</Pill>;
  return <Pill tone="brick">{matchStatusLabel[status] ?? status}</Pill>;
}
