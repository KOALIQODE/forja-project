<script lang="ts">
  import type { Component } from "svelte";
  import { FolderOpen, Clock, Download } from "@lucide/svelte";
  import { openProject } from "../stores/projectStore";
  import { openCloneRepositoryDialog, openRecentProjectsDialog } from "../stores/dialogStore";
  import { open } from "@tauri-apps/plugin-dialog";
  import { theme } from "$lib/stores/uiThemeStore";
  import ForjaLogo from "./ForjaLogo.svelte";

  const version = "1.0.0beta";

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
    class="group relative flex cursor-pointer border-(--color-border) border items-center overflow-hidden bg-(--color-surface-raised) px-5 py-4 font-semibold text-(--color-text-secondary) transition-all duration-300  hover:text-(--color-text-primary)"
    onclick={handler}
  >
    <div class="absolute top-0 -left-full h-full w-full bg-linear-to-r from-transparent via-white/5 transition-all duration-1000 group-hover:left-full"></div>
    <div class="flex items-center gap-4">
      <Icon strokeWidth={2.5} size="1.2em" />
      <span>{label}</span>
    </div>
  </button>
{/snippet}

<section
  class="flex h-full w-full items-center justify-center outline-none font-semibold"
  use:theme
>
  <div class="w-full max-w-120 px-8 py-12 text-center">
    <!-- Header -->
    <header class="flex flex-col mb-10 animate-[fadeInUp_0.6s_ease_0.1s_both] gap-8">
      <div class="flex justify-center">
        <ForjaLogo />
      </div>
      <h5 class="m-0 text-(--color-text-muted)">v{version}</h5>
    </header>

    <!-- Tagline -->
    <section class="mb-14 animate-[fadeInUp_0.6s_ease_0.2s_both]">
      <h1 class="m-0 mb-1 text-(--color-text-primary)">
        Forge your <span class="bg-linear-to-r from-(--color-accent) to-(--color-accent-alt) bg-clip-text text-transparent">workflow</span>
      </h1>
      <h3 class="m-0 font-medium text-(--color-text-muted)">
        A lightweight, modular editor that grows with your needs.
      </h3>
    </section>

    <!-- Action buttons -->
    <section class="mb-10 flex flex-col gap-3 animate-[fadeInUp_0.6s_ease_0.3s_both]">
      {@render actionButton(FolderOpen, "Open Project", handleOpenProject)}
      {@render actionButton(Download, "Clone Repository", openCloneRepositoryDialog)}
      {@render actionButton(Clock, "Recent Projects", openRecentProjectsDialog)}
    </section>
  </div>
</section>
