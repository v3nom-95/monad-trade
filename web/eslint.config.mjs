import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Read-only spike scripts against the live Kuru contracts. Not shipped,
    // not imported by the app (only the .json ABI beside them is).
    "lib/chain/__probe__/*.mjs",
    "lib/chain/__probe__/*.cjs",
  ]),
]);

export default eslintConfig;
