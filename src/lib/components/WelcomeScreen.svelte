<script lang="ts">
  import type { Component } from "svelte";
  import { FolderOpen, Clock } from "@lucide/svelte";
  import { openProject } from "../stores/projectStore";
  import { openRecentProjectsDialog } from "../stores/dialogStore";
  import { open } from "@tauri-apps/plugin-dialog";
  import { activeUITheme } from "../stores/uiThemeStore";
  import ForjaLogo from "./ForjaLogo.svelte";

  const version = "1.0.0-alpha";

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
</script>

{#snippet actionButton(Icon: Component, label: string, handler: () => void)}
  <button
    type="button"
    class="group relative flex cursor-pointer items-center overflow-hidden rounded-lg border border-(--forja-ui-btn-border,#27272a) bg-(--forja-ui-btn-bg,rgba(9,9,11,0.3)) px-5 py-4 font-medium text-(--forja-ui-btn-text,#a1a1aa) transition-all duration-300 hover:border-(--forja-ui-btn-hover-border,rgba(16,185,129,0.5)) hover:bg-(--forja-ui-btn-hover-bg,rgba(16,185,129,0.05)) hover:text-(--forja-ui-btn-hover-text,#f4f4f5) hover:shadow-(--forja-ui-btn-hover-shadow,0_0_25px_rgba(16,185,129,0.1))"
    onclick={handler}
  >
    <div class="absolute top-0 -left-full h-full w-full bg-linear-to-r from-transparent via-white/5 to-transparent transition-all duration-1000 group-hover:left-full"></div>
    <div class="flex items-center gap-4">
      <Icon size="15" class="text-(--forja-ui-btn-icon,#71717a) transition-colors group-hover:text-(--forja-ui-btn-icon-hover,#34d399)" />
      <span>{label}</span>
    </div>
  </button>
{/snippet}

<main
  class="flex h-full w-full items-center justify-center outline-none"
  data-program-ui
  style={themeStyle}
>
  <div class="w-full max-w-120 px-8 py-12 text-center">
    <!-- Header -->
    <header class="flex flex-col mb-10 animate-[fadeInUp_0.6s_ease_0.1s_both] gap-8">
      <div class="flex justify-center">
        <ForjaLogo />
      </div>
      <p class="m-0 text-base font-medium text-(--forja-ui-text-version,#52525b) opacity-80">v{version}</p>
    </header>

    <!-- Tagline -->
    <section class="mb-14 animate-[fadeInUp_0.6s_ease_0.2s_both]">
      <p class="m-0 mb-1 text-2xl font-normal leading-relaxed text-(--forja-ui-text-secondary,#a1a1aa)">
        Forge your <span class="bg-linear-to-r from-(--forja-ui-gradient-from,#34d399) to-(--forja-ui-gradient-to,#2dd4bf) bg-clip-text font-semibold text-transparent">workflow</span>
      </p>
      <p class="m-0 text-lg leading-relaxed text-(--forja-ui-text-muted,#71717a)">
        A lightweight, modular editor that grows with your needs.
      </p>
    </section>

    <!-- Action buttons -->
    <section class="mb-10 flex flex-col gap-3 animate-[fadeInUp_0.6s_ease_0.3s_both] text-[13px]">
      {@render actionButton(FolderOpen, "Open Project", handleOpenProject)}
      {@render actionButton(Clock, "Recent Projects", openRecentProjectsDialog)}
    </section>
  </div>
</main>
