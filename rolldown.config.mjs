import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/index.ts",
  external: ["auto-wc", "tsyntax"],
  output: {
    format: "esm",
    file: "dist/interactably.js",
  },
});