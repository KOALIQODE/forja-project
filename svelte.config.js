// Tauri + SvelteKit with Node.js backend for API routes
// Using adapter-node to enable server-side API routes
import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // Configure adapter-node options
      out: "build",
    }),
  },
};

export default config;
