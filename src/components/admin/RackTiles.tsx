// Affichage visuel d'un tirage sous forme de tuiles (une par lettre), pour
// la page d'arbitrage — complète le champ texte habituel sans le remplacer,
// un "?" représente une lettre blanche (joker) en main. Le "+" de fin de
// reliquat (convention d'affichage/saisie, voir formatReliquat) n'est pas
// une lettre et n'est jamais affiché ici.
export function RackTiles({ rack }: { rack: string }) {
  const letters = rack.replace(/\+/g, "").split("").filter((c) => c.trim() !== "");

  if (letters.length === 0) {
    return <p className="text-xs text-black/40 dark:text-white/40">Tirage non renseigné.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {letters.map((letter, i) => (
        <span
          key={i}
          className="flex h-9 w-9 items-center justify-center rounded border border-gold/50 dark:border-gold-light/50 bg-gold/15 dark:bg-gold-light/15 font-heading text-base font-semibold text-navy dark:text-gold-light uppercase"
        >
          {letter}
        </span>
      ))}
    </div>
  );
}
