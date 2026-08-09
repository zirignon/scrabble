/** Règles pures, partageables et testables de configuration de sécurité. */
export function hasSecureSessionSecret(secret: string | undefined) {
  return Boolean(secret && secret !== "change-me" && secret.length >= 32);
}

export function canRunDemoSeed(nodeEnv: string | undefined) {
  return nodeEnv !== "production";
}
