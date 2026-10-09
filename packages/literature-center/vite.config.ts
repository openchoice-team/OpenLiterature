import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "OpenDHULiteratureCenter",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      // Keep every runtime dependency external so hosts can dedupe React,
      // MapLibre and the query client with their own versions.
      external: (id) => !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0"),
    },
    sourcemap: true,
  },
});
