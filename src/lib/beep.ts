"use client";

// Contexte audio partagé, créé une seule fois (lazy) — nécessaire pour la
// sonnerie du minuteur sur l'affichage grand écran.
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!ctx) ctx = new AudioContextCtor();
  return ctx;
}

// Les navigateurs bloquent la lecture audio tant qu'il n'y a pas eu
// d'interaction de l'utilisateur sur la page — à appeler une fois au
// montage d'une page qui devra ensuite jouer un son sans clic direct
// (ex. écran de projection laissé sans surveillance) : le premier
// clic/appui touche débloque la lecture pour le reste de la session.
export function unlockAudioOnFirstInteraction() {
  if (typeof window === "undefined") return;
  const unlock = () => {
    const c = getContext();
    if (c?.state === "suspended") c.resume();
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

// Sonnerie brève synthétisée (pas de fichier audio à héberger), utilisée
// pour signaler que le minuteur passe sous un seuil critique.
export function playBeep() {
  const c = getContext();
  if (!c) return;
  try {
    const oscillator = c.createOscillator();
    const gain = c.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
    oscillator.connect(gain);
    gain.connect(c.destination);
    oscillator.start();
    oscillator.stop(c.currentTime + 0.5);
  } catch {
    // Lecture audio indisponible (politique du navigateur) : on ignore.
  }
}
