// Marque discrète : une tuile de Scrabble stylisée (lettre + valeur en
// coin), dans la palette existante du site plutôt qu'un pictogramme
// générique. Taille et couleur ajustables via les props pour s'adapter à
// la barre de navigation comme à un usage plus grand (favicon, partages).
export function Logo({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="6"
        fill="var(--color-navy)"
      />
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="6"
        fill="none"
        stroke="var(--color-gold)"
        strokeOpacity="0.5"
      />
      <text
        x="13"
        y="23"
        textAnchor="middle"
        fontFamily="var(--font-heading, serif)"
        fontSize="19"
        fontWeight="600"
        fill="white"
      >
        S
      </text>
      <text
        x="24.5"
        y="26.5"
        textAnchor="middle"
        fontFamily="var(--font-sans, sans-serif)"
        fontSize="7"
        fill="var(--color-gold-light)"
      >
        1
      </text>
    </svg>
  );
}
