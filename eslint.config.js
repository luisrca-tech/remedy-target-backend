import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "dist/**", "drizzle/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        // Bun runtime globals used by the service and scripts.
        Bun: "readonly",
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
      },
    },
    rules: {
      // Enforce the no-silent-failure rule from the engineering guidelines.
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
);
