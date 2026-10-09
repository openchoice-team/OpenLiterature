import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@opendhu/literature-center": resolve(
        __dirname,
        "../../packages/literature-center/src/index.ts",
      ),
      "@opendhu/literature-reader": resolve(
        __dirname,
        "../../packages/literature-reader/src/index.ts",
      ),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-query", "react-map-gl"],
  },
  server: {
    port: 5181,
    host: "0.0.0.0",
  },
  preview: {
    port: 5181,
    host: "0.0.0.0",
  },
});
