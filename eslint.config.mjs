import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
    },
  },
  {
    files: ["scripts/**"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
  {
    files: ["public/sw.js"],
    languageOptions: { globals: { self: "readonly" } },
  },
  {
    ignores: ["node_modules/**", ".next/**", "public/ffmpeg/**"],
  },
];
