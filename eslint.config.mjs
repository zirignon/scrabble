import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next active no-unused-vars sans argsIgnorePattern : le
  // préfixe "_" déjà utilisé dans tout le code pour les paramètres requis
  // par une signature imposée (ex. prevState/formData de useActionState,
  // request d'un handler de route) ne fait alors ignorer l'avertissement
  // que par accident, quand un paramètre suivant non préfixé est lui
  // utilisé (option "after-used" par défaut) — sinon (aucun paramètre
  // utilisé après), l'avertissement reste. Ce réglage rend la convention
  // du préfixe réellement effective dans tous les cas.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
