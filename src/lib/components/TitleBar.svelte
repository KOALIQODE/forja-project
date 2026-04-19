<script lang="ts">
  import { Bell, Puzzle, User, BadgeQuestionMark, Minus, Square, X, Settings } from "@lucide/svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
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

<header class="flex h-10 w-full items-center justify-between bg-transparent text-[#e0e0e0] select-none" data-tauri-drag-region>
  <!-- Left section - Logo/Brand -->
  <div class="flex items-center pl-4">
    <div class="flex items-center gap-2.5">
      <div class="relative flex h-4 w-4 items-center justify-center">
        <div class="absolute h-full w-full rotate-45 rounded-[3px] border border-emerald-500/50 bg-emerald-500/10"></div>
        <div class="z-10 h-1.5 w-1.5 rotate-45 rounded-sm bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
      </div>
      <h1 class="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.05em]">
        <span class="text-zinc-100">Forja</span>
        <span class="text-emerald-500">Studio</span>
        <span class="text-zinc-500">Editor</span>
      </h1>
    </div>
  </div>

  <!-- Right section - Actions & Controls -->
  <div class="flex items-center">
    <!-- Notification & User actions -->
    <div class="flex items-center gap-0.5 pr-2">
      <button type="button" class="flex cursor-pointer items-center justify-center rounded bg-transparent p-2 text-[#b0b0b0] transition-all hover:bg-white/8 hover:text-white" title="Notifications">
        <Bell size="16" />
      </button>
      <button type="button" class="flex cursor-pointer items-center justify-center rounded bg-transparent p-2 text-[#b0b0b0] transition-all hover:bg-white/8 hover:text-white">
        <Puzzle size="16" />
      </button>
      <button type="button" class="flex cursor-pointer items-center justify-center rounded bg-transparent p-2 text-[#b0b0b0] transition-all hover:bg-white/8 hover:text-white" title="Settings">
        <Settings size="16" />
      </button>
      <button type="button" class="flex cursor-pointer items-center justify-center rounded bg-transparent p-2 text-[#b0b0b0] transition-all hover:bg-white/8 hover:text-white" title="Help">
        <BadgeQuestionMark size="16" />
      </button>
    </div>

    <!-- Window controls -->
    <div class="flex h-10 items-center">
      <button
        type="button"
        class="flex h-full w-[46px] cursor-pointer items-center justify-center bg-transparent text-[#b0b0b0] transition-all hover:bg-white/10 hover:text-white active:scale-95"
        title="Minimize"
        onclick={handleMinimize}
      >
        <Minus size="14" />
      </button>
      <button
        type="button"
        class="flex h-full w-[46px] cursor-pointer items-center justify-center bg-transparent text-[#b0b0b0] transition-all hover:bg-white/10 hover:text-white active:scale-95"
        title="Maximize"
        onclick={handleMaximize}
      >
        <Square size="12" />
      </button>
      <button
        type="button"
        class="flex h-full w-[46px] cursor-pointer items-center justify-center bg-transparent text-[#b0b0b0] transition-all hover:bg-[#e74c3c] hover:text-white active:scale-95"
        title="Close"
        onclick={handleClose}
      >
        <X size="14" />
      </button>
    </div>
  </div>
</header>
