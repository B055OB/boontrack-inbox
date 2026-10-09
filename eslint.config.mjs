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
    "scripts/**",
    "tests/**",
    "__tests__/**",
    "scratch/**",
    "public/**",
    "node_modules/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "prefer-const": "warn",
      "react/no-unescaped-entities": "off",
      "react-hooks/rules-of-hooks": "warn",
      "react/jsx-no-comment-textnodes": "warn",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/components",
              message:
                "Sweeping barrel import from @/components is prohibited to prevent circular dependencies and TDZ crashes. Import directly from specific component files instead.",
            },
            {
              name: "@/lib",
              message:
                "Sweeping barrel import from @/lib is prohibited to prevent circular dependencies and TDZ crashes. Import directly from specific lib files instead.",
            },
            {
              name: "@/components/index",
              message:
                "Barrel export from components/index is prohibited to prevent circular dependencies and TDZ crashes. Import directly from specific component files instead.",
            },
            {
              name: "@/lib/index",
              message:
                "Barrel export from lib/index is prohibited to prevent circular dependencies and TDZ crashes. Import directly from specific lib files instead.",
            },
          ],
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
