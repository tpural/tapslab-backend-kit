import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Shipped as source and compiled inside every consuming app, so a lint failure
 * here is a failure in each of them. Type-aware rules are deliberately off:
 * this package has no build, and the cost of a full type-check per lint run
 * buys little on top of `tsc --noEmit` already running in CI.
 */
export default tseslint.config(
  { ignores: ["node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
