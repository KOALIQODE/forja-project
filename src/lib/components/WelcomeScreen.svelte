<script lang="ts">
  import { FolderOpen, Clock } from "@lucide/svelte";
  import { openProject } from "../stores/projectStore";
  import { openRecentProjectsDialog } from "../stores/dialogStore";
  import { open } from "@tauri-apps/plugin-dialog";
  import { activeUITheme } from "../stores/uiThemeStore";

  const version = "1.0.0-alpha";

  let welcomeContainer: HTMLElement;

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );

  async function handleOpenProject() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Folder",
      });
      if (selected) openProject(selected);
    } catch (error) {
      console.error("Error opening folder dialog", error);
    }
  }

  function handleRecentProjects() {
    openRecentProjectsDialog();
  }
</script>

<main
  class="flex h-full w-full items-center justify-center outline-none"
  data-program-ui
  style={themeStyle}
  bind:this={welcomeContainer}
>
  <div class="w-full max-w-[480px] px-8 py-12 text-center">
    <!-- Header -->
    <header class="mb-10 animate-[fadeInUp_0.6s_ease_0.1s_both]">
      <div class="flex justify-center mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 100 100"
          fill="none"
          class="h-16 w-16 transition-all duration-500"
          style="filter: drop-shadow(0 0 12px var(--forja-ui-logo-glow, rgba(26,171,109,0.35))) drop-shadow(0 0 4px var(--forja-ui-logo-glow, rgba(26,171,109,0.35)))"
          aria-label="Forja"
        >
          <rect x="8" y="8" width="84" height="84" rx="20" ry="20"
                fill="var(--forja-ui-logo-outer, rgba(126,207,176,0.55))"
                transform="rotate(45 50 50)" />
          <rect x="18" y="18" width="64" height="64" rx="15" ry="15"
                fill="var(--forja-ui-logo-mid, #1e3a2f)"
                transform="rotate(45 50 50)" />
          <rect x="31" y="31" width="38" height="38" rx="9" ry="9"
                fill="var(--forja-ui-logo-core, #1aab6d)"
                transform="rotate(45 50 50)" />
        </svg>
      </div>
      <p class="m-0 text-base font-medium text-[var(--forja-ui-text-version,#52525b)] opacity-80">v{version}</p>
    </header>

    <!-- Tagline -->
    <section class="mb-14 animate-[fadeInUp_0.6s_ease_0.2s_both]">
      <p class="m-0 mb-1 text-2xl font-normal leading-relaxed text-[var(--forja-ui-text-secondary,#a1a1aa)]">
        Forge your <span class="bg-gradient-to-r from-[var(--forja-ui-gradient-from,#34d399)] to-[var(--forja-ui-gradient-to,#2dd4bf)] bg-clip-text font-semibold text-transparent">workflow</span>
      </p>
      <p class="m-0 text-lg leading-relaxed text-[var(--forja-ui-text-muted,#71717a)]">
        A lightweight, modular editor that grows with your needs.
      </p>
    </section>

    <!-- Action buttons -->
    <section class="mb-10 flex flex-col gap-3 animate-[fadeInUp_0.6s_ease_0.3s_both] text-[13px]">
      <button
        type="button"
        class="group relative flex cursor-pointer items-center overflow-hidden rounded-lg border border-[var(--forja-ui-btn-border,#27272a)] bg-[var(--forja-ui-btn-bg,rgba(9,9,11,0.3))] px-5 py-4 font-medium text-[var(--forja-ui-btn-text,#a1a1aa)] transition-all duration-300 hover:border-[var(--forja-ui-btn-hover-border,rgba(16,185,129,0.5))] hover:bg-[var(--forja-ui-btn-hover-bg,rgba(16,185,129,0.05))] hover:text-[var(--forja-ui-btn-hover-text,#f4f4f5)] hover:shadow-[var(--forja-ui-btn-hover-shadow,0_0_25px_rgba(16,185,129,0.1))]"
        onclick={(e) => { e.preventDefault(); handleOpenProject(); }}
      >
        <div class="absolute top-0 -left-full h-full w-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-all duration-1000 group-hover:left-full"></div>
        <div class="flex items-center gap-4">
          <FolderOpen size="15" class="text-[var(--forja-ui-btn-icon,#71717a)] transition-colors group-hover:text-[var(--forja-ui-btn-icon-hover,#34d399)]" />
          <span>Open Project</span>
        </div>
      </button>

      <!-- <button
        type="button"
        class="group relative flex cursor-pointer items-center overflow-hidden rounded-lg border border-[var(--forja-ui-btn-border,#27272a)] bg-[var(--forja-ui-btn-bg,rgba(9,9,11,0.3))] px-5 py-4 font-medium text-[var(--forja-ui-btn-text,#a1a1aa)] transition-all duration-300 hover:border-[var(--forja-ui-btn-hover-border,rgba(16,185,129,0.5))] hover:bg-[var(--forja-ui-btn-hover-bg,rgba(16,185,129,0.05))] hover:text-[var(--forja-ui-btn-hover-text,#f4f4f5)] hover:shadow-[var(--forja-ui-btn-hover-shadow,0_0_25px_rgba(16,185,129,0.1))]"
        onclick={(e) => { e.preventDefault(); }}
      >
        <div class="absolute top-0 -left-full h-full w-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-all duration-1000 group-hover:left-full"></div>
        <div class="flex items-center gap-4">
          <Plus size="15" class="text-[var(--forja-ui-btn-icon,#71717a)] transition-colors group-hover:text-[var(--forja-ui-btn-icon-hover,#34d399)]" />
          <span>New Empty Project</span>
        </div>
      </button> -->

      <button
        type="button"
        class="group relative flex cursor-pointer items-center overflow-hidden rounded-lg border border-[var(--forja-ui-btn-border,#27272a)] bg-[var(--forja-ui-btn-bg,rgba(9,9,11,0.3))] px-5 py-4 font-medium text-[var(--forja-ui-btn-text,#a1a1aa)] transition-all duration-300 hover:border-[var(--forja-ui-btn-hover-border,rgba(16,185,129,0.5))] hover:bg-[var(--forja-ui-btn-hover-bg,rgba(16,185,129,0.05))] hover:text-[var(--forja-ui-btn-hover-text,#f4f4f5)] hover:shadow-[var(--forja-ui-btn-hover-shadow,0_0_25px_rgba(16,185,129,0.1))]"
        onclick={(e) => { e.preventDefault(); handleRecentProjects(); }}
      >
        <div class="absolute top-0 -left-full h-full w-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-all duration-1000 group-hover:left-full"></div>
        <div class="flex items-center gap-4">
          <Clock size="15" class="text-[var(--forja-ui-btn-icon,#71717a)] transition-colors group-hover:text-[var(--forja-ui-btn-icon-hover,#34d399)]" />
          <span>Recent Projects</span>
        </div>
      </button>
    </section>
  </div>
</main>

<style>
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
