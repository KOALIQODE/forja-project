<script lang="ts">
  import { Puzzle, BadgeQuestionMark, Minus, Square, X, Settings } from "@lucide/svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { openPreferencesDialog, openExtensionsManager } from "../stores/dialogStore";
  import { activeUITheme } from "../stores/uiThemeStore";

  const appWindow = getCurrentWindow();

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );

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
  class="flex h-10 w-full items-center justify-between bg-transparent text-(--forja-ui-text-primary,#e0e0e0) select-none"
  data-program-ui
  data-tauri-drag-region
  style={themeStyle}
>
  <!-- Left section - Logo/Brand -->
  <div class="flex items-center pl-4">
    <div class="flex items-center gap-2.5">
      <div class="relative flex h-4 w-4 items-center justify-center">
        <div class="absolute h-full w-full rotate-45 border border-(--forja-ui-gradient-from,#10b981)/50 bg-(--forja-ui-gradient-from,#10b981)/10"></div>
        <div class="z-10 h-1.5 w-1.5 rotate-45 bg-(--forja-ui-gradient-from,#10b981) shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
      </div>
      <h1 class="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.05em]">
        <span class="text-(--forja-ui-text-primary,#f4f4f5)">Forja</span>
        <span class="text-(--forja-ui-gradient-from,#34d399)">Studio</span>
        <span class="text-(--forja-ui-text-muted,#71717a)">Editor</span>
      </h1>
    </div>
  </div>

  <!-- Right section - Actions & Controls -->
  <div class="flex items-center">
    <!-- Action buttons -->
    <div class="flex items-center gap-0.5 pr-2">
      <button
        type="button"
        class="flex cursor-pointer items-center justify-center bg-transparent p-2 text-(--forja-ui-btn-icon,#9ca3af) transition-all hover:bg-(--forja-ui-picker-item-hover,rgba(255,255,255,0.08)) hover:text-(--forja-ui-text-primary,#ffffff)"
        title="Extensions"
        onclick={() => openExtensionsManager()}
      >
        <Puzzle size="16" />
      </button>
      <button
        type="button"
        class="flex cursor-pointer items-center justify-center bg-transparent p-2 text-(--forja-ui-btn-icon,#9ca3af) transition-all hover:bg-(--forja-ui-picker-item-hover,rgba(255,255,255,0.08)) hover:text-(--forja-ui-text-primary,#ffffff)"
        title="Preferences"
        onclick={() => openPreferencesDialog("program")}
      >
        <Settings size="16" />
      </button>
      <button
        type="button"
        class="flex cursor-pointer items-center justify-center bg-transparent p-2 text-(--forja-ui-btn-icon,#9ca3af) transition-all hover:bg-(--forja-ui-picker-item-hover,rgba(255,255,255,0.08)) hover:text-(--forja-ui-text-primary,#ffffff)"
        title="Help"
      >
        <BadgeQuestionMark size="16" />
      </button>
    </div>

    <!-- Window controls -->
    <div class="flex h-10 items-center">
      <button
        type="button"
        class="flex h-full w-[46px] cursor-pointer items-center justify-center bg-transparent text-(--forja-ui-btn-icon,#9ca3af) transition-all hover:bg-(--forja-ui-picker-item-hover,rgba(255,255,255,0.08)) hover:text-(--forja-ui-text-primary,#ffffff) active:scale-95"
        title="Minimize"
        onclick={handleMinimize}
      >
        <Minus size="14" />
      </button>
      <button
        type="button"
        class="flex h-full w-[46px] cursor-pointer items-center justify-center bg-transparent text-(--forja-ui-btn-icon,#9ca3af) transition-all hover:bg-(--forja-ui-picker-item-hover,rgba(255,255,255,0.08)) hover:text-(--forja-ui-text-primary,#ffffff) active:scale-95"
        title="Maximize"
        onclick={handleMaximize}
      >
        <Square size="12" />
      </button>
      <button
        type="button"
        class="flex h-full w-[46px] cursor-pointer items-center justify-center bg-transparent text-(--forja-ui-btn-icon,#9ca3af) transition-all hover:bg-[#e74c3c] hover:text-white active:scale-95"
        title="Close"
        onclick={handleClose}
      >
        <X size="14" />
      </button>
    </div>
  </div>
</header>
