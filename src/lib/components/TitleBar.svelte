<script lang="ts">
  import { Puzzle, Minus, Square, X, Settings } from "@lucide/svelte";
  import {
    openPreferencesDialog,
    openExtensionsManager,
  } from "../stores/dialogStore";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { theme } from "$lib/stores/uiThemeStore";

  const appWindow = getCurrentWindow();

  function handleMinimize() {
    appWindow.minimize();
  }

  function handleMaximize() {
    appWindow.toggleMaximize();
  }

  function handleClose() {
    appWindow.close();
  }
</script>

<header
  class="flex h-10 w-full items-center justify-between bg-transparent select-none"
  data-tauri-drag-region
  use:theme
>
  <!-- Left section - Logo/Brand -->
  <div class="flex items-center pl-4">
    <div class="flex items-center gap-2.5">
      <div class="relative flex h-4 w-4 items-center justify-center">
        <div
          class="absolute h-full w-full rotate-45 border border-(--color-accent)/50 bg-(--color-accent)/10"
        ></div>
        <div
          class="z-10 h-1.5 w-1.5 rotate-45 bg-(--color-accent) shadow-[0_0_8px_rgba(16,185,129,0.6)]"
        ></div>
      </div>
      <span
        class="flex items-center gap-1 font-semibold uppercase"
      >
        <span class="text-(--color-text-primary)">Forja</span>
        <span class="text-(--color-accent)">Studio</span>
        <span class="text-(--color-text-primary)">Editor</span>
      </span>
    </div>
  </div>

  <!-- Right section - Actions & Controls -->
  <div class="flex items-center">
    <!-- Action buttons -->
    <div class="flex items-center gap-0.5 pr-2">
      <button
        type="button"
        class="flex cursor-pointer items-center justify-center bg-transparent p-2 text-(--color-text-secondary) hover:text-(--color-text-primary)"
        title="Extensions"
        onclick={() => openExtensionsManager()}
      >
        <Puzzle strokeWidth={2.5} size="1.4em" />
      </button>
      <button
        type="button"
        class="flex cursor-pointer items-center justify-center bg-transparent p-2 text-(--color-text-secondary) hover:text-(--color-text-primary)"
        title="Preferences"
        onclick={() => openPreferencesDialog("program")}
      >
        <Settings strokeWidth={2.5} size="1.4em" />
      </button>
    </div>

    <!-- Window controls -->
    <div class="flex h-10 items-center">
      <button
        type="button"
        class="flex h-full w-11.5 cursor-pointer items-center justify-center bg-transparent text-(--color-text-secondary) hover:text-(--color-text-primary)"
        title="Minimize"
        onclick={handleMinimize}
      >
        <Minus strokeWidth={2.5} size="1.2em" />
      </button>
      <button
        type="button"
        class="flex h-full w-11.5 cursor-pointer items-center justify-center bg-transparent text-(--color-text-secondary) hover:text-(--color-text-primary)"
        title="Maximize"
        onclick={handleMaximize}
      >
        <Square strokeWidth={2.5} size="1em" />
      </button>
      <button
        type="button"
        class="flex h-full w-11.5 cursor-pointer items-center justify-center bg-transparent text-(--color-text-secondary) hover:bg-[#e74c3c] hover:text-white active:scale-95"
        title="Close"
        onclick={handleClose}
      >
        <X strokeWidth={2.5} size="1.2em" />
      </button>
    </div>
  </div>
</header>
