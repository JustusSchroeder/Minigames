import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../../../meridian-front",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    fs: {
      allow: ["../.."],
    },
  },
});
