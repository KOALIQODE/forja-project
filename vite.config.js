import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [sveltekit(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. Tell Vite to ignore watching `src-tauri` and files the user might
      //    edit with Forja. Without this, saving any file that Vite tracks
      //    (HTML, JSON, CSS, scripts…) triggers a full HMR reload of the
      //    Tauri webview — even when the edited file has nothing to do with
      //    Forja's own source code.
      //
      //    We keep Vite watching only its true source files (*.svelte, *.ts,
      //    *.js inside src/) by excluding everything else that isn't actually
      //    part of the compiled frontend bundle.
      ignored: [
        // Rust backend — always excluded
        "**/src-tauri/**",
        // Project documentation
        "**/README.md",
        "**/ARCH.md",
        "**/THEMES.md",
        "**/PLUGINS.md",
        "**/.codex/**",
        // File types commonly edited by the user with Forja.
        // Vite does NOT need to watch these for HMR; if you change
        // src/app.html or a config file during development, do a
        // manual browser refresh (Ctrl+R) instead.
        "**/*.html",
        "**/*.json",
        "**/*.jsonc",
        "**/*.css",
        "**/*.scss",
        "**/*.md",
        "**/*.txt",
        "**/*.yaml",
        "**/*.yml",
        "**/*.toml",
        "**/*.xml",
        "**/*.svg",
        // Source files from OTHER projects the user might be editing
        // (Forja's own .svelte/.ts files inside src/ are still watched)
        "**/*.rs",
        "**/*.py",
        "**/*.go",
        "**/*.java",
        "**/*.c",
        "**/*.cpp",
        "**/*.h",
        "**/*.sh",
        "**/*.bash",
        "**/*.zsh",
      ],
    },
  },
}));
