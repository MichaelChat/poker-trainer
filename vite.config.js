import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: set `base` to match your repo name for GitHub Pages, e.g. "/poker-trainer/".
// If you deploy to a custom domain or user/organization root page instead, set base to "/".
export default defineConfig({
  plugins: [react()],
  base: "/poker-trainer/",
  test: {
    environment: "node",
    globals: true,
  },
});
