import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "OpenDHULiteratureReader",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      // Keep every runtime dependency external so hosts can dedupe React,
      // the query client and markdown toolchain with their own versions.
      external: (id) => !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0"),
    },
    sourcemap: true,
  },
});
