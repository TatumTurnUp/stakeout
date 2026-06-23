import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standard Vite + React setup. `npm run dev` serves locally;
// `npm run build` outputs a static site to /dist that Vercel deploys.
export default defineConfig({
  plugins: [react()],
});
