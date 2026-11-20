import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { guroMateVitePlugin } from "./src/server/guroMateVitePlugin";

export default defineConfig({
  plugins: [tailwindcss(), react(), guroMateVitePlugin()],
  build: {
    target: "esnext",
  },
});
