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
    // Vitest's default include pattern only matches "*.test.js"/"*.spec.js" (a literal dot),
    // but this repo's convention is "*_test.js" (underscore, e.g. engine_test.js) — without
    // this, `npm test` silently finds zero test files and exits as if everything passed.
    include: ["**/*_test.{js,jsx,ts,tsx}", "**/*.{test,spec}.?(c|m)[jt]s?(x)"],
  },
});
