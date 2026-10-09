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
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/index*", "**/components/index*"],
              message:
                "Barrel export from components/index is prohibited to prevent circular dependencies and TDZ crashes. Import directly from specific component files instead.",
            },
            {
              group: ["@/lib/index*", "**/lib/index*"],
              message:
                "Barrel export from lib/index is prohibited to prevent circular dependencies and TDZ crashes. Import directly from specific lib files instead.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
