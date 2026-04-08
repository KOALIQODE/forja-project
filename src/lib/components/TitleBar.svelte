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

<header class="flex h-10 w-full items-center justify-between border-b border-[#404040] bg-transparent text-[#e0e0e0] select-none" data-tauri-drag-region>
  <!-- Left section - Logo/Brand -->
  <div class="flex items-center pl-4">
    <!-- <div class="logo"></div> -->
  </div>

  <!-- Right section - Actions & Controls -->
  <div class="flex items-center">
    <!-- Notification & User actions -->
    <div class="flex items-center gap-0.5 pr-2">
      <button class="flex cursor-pointer items-center justify-center rounded bg-transparent p-2 text-[#b0b0b0] transition-all hover:bg-white/8 hover:text-white" title="Notifications">
        <Bell size="16" />
      </button>
      <button class="flex cursor-pointer items-center justify-center rounded bg-transparent p-2 text-[#b0b0b0] transition-all hover:bg-white/8 hover:text-white">
        <Puzzle size="16" />
      </button>
      <button class="flex cursor-pointer items-center justify-center rounded bg-transparent p-2 text-[#b0b0b0] transition-all hover:bg-white/8 hover:text-white" title="Profile">
        <User size="16" />
      </button>
      <button class="flex cursor-pointer items-center justify-center rounded bg-transparent p-2 text-[#b0b0b0] transition-all hover:bg-white/8 hover:text-white" title="Settings">
        <Settings size="16" />
      </button>
      <button class="flex cursor-pointer items-center justify-center rounded bg-transparent p-2 text-[#b0b0b0] transition-all hover:bg-white/8 hover:text-white" title="Help">
        <BadgeQuestionMark size="16" />
      </button>
    </div>

    <!-- Window controls -->
    <div class="flex h-10 items-center">
      <button
        class="flex h-full w-[46px] cursor-pointer items-center justify-center bg-transparent text-[#b0b0b0] transition-all hover:bg-white/10 hover:text-white active:scale-95"
        title="Minimize"
        onclick={handleMinimize}
      >
        <Minus size="14" />
      </button>
      <button
        class="flex h-full w-[46px] cursor-pointer items-center justify-center bg-transparent text-[#b0b0b0] transition-all hover:bg-white/10 hover:text-white active:scale-95"
        title="Maximize"
        onclick={handleMaximize}
      >
        <Square size="12" />
      </button>
      <button
        class="flex h-full w-[46px] cursor-pointer items-center justify-center bg-transparent text-[#b0b0b0] transition-all hover:bg-[#e74c3c] hover:text-white active:scale-95"
        title="Close"
        onclick={handleClose}
      >
        <X size="14" />
      </button>
    </div>
  </div>
</header>
