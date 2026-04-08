<script lang="ts">
  import { FolderOpen, Plus, Clock } from "@lucide/svelte";
  import { onMount, onDestroy } from "svelte";
  import { openProject } from "../stores/projectStore";
  import { openRecentProjectsDialog } from "../stores/dialogStore";
  import { keyboardManager } from "../utils/keyboardManager";
  import { open } from "@tauri-apps/plugin-dialog";
  import { 
    UI_TEXT, 
    ERROR_MESSAGES,
  } from "../utils/constants.js";
  
  // Nvim integration imports
  import { 
    nvimNavEnabled, 
    selectedIndex,
    connectNvimForComponent
  } from "$lib/stores/nvimStore";
  
  import { BUFFER_IDS } from "$lib/nvim/contentIds";
  import { NavigationFactory } from "$lib/nvim/navigationStrategies";

  // Simulamos obtener la versión del sistema - en producción vendrá de Tauri
  const version = "1.0.0-alpha";

  let welcomeContainer: HTMLElement;
  let navigationCleanup: (() => void) | null = null;

  // Initialize nvim navigation
  async function initializeNvim() {
    const connected = await connectNvimForComponent(BUFFER_IDS.WELCOME_SCREEN);
    if (connected) {
      $nvimNavEnabled = true;
      setupNavigationStrategy();
    }
  }

  // Setup navigation strategy
  function setupNavigationStrategy() {
    const navigation = NavigationFactory.createNavigation(BUFFER_IDS.WELCOME_SCREEN);
    navigationCleanup = navigation.handleNavigation(
      () => {}, 
      () => {}, 
      selectCurrent
    );
  }

  async function handleOpenProject() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Folder",
      });

      if (selected) {
        openProject(selected);
      }
    } catch (error) {
      console.error(ERROR_MESSAGES.FOLDER_DIALOG_FAILED, error);
    }
  }

  function handleNewProject() {
    console.log('Creating new project...');
    // TODO: Implement new project creation
  }

  function handleRecentProjects() {
    console.log('Showing recent projects...');
    // Pass current context to preserve it
    const currentContext = keyboardManager.getActiveContext();
    openRecentProjectsDialog(currentContext);
  }

  function selectCurrent() {
    switch($selectedIndex) {
      case 0:
        handleOpenProject();
        break;
      case 1:
        handleNewProject();
        break;
      case 2:
        handleRecentProjects();
        break;
    }
  }

  onMount(async () => {
    await initializeNvim();
  });

  onDestroy(() => {
    navigationCleanup?.();
  });
</script>

<main 
  class="flex h-full w-full items-center justify-center outline-none" 
  tabindex="-1" 
  bind:this={welcomeContainer}
>
  <div class="w-full max-w-[480px] px-8 py-12 text-center">
    <!-- Header section -->
    <header class="mb-12 animate-[fadeInUp_0.6s_ease_0.1s_both]">
      <h1 class="m-0 mb-4 text-5xl font-light leading-[1.1] tracking-tight">
        <span class="font-semibold text-zinc-100">{UI_TEXT.APP_TITLE}</span>
        <span class="font-light text-zinc-500">{UI_TEXT.APP_SUBTITLE}</span>
      </h1>
      <p class="m-0 text-lg font-medium text-zinc-600 opacity-80">v{version}</p>
    </header>

    <!-- Tagline -->
    <section class="mb-16 animate-[fadeInUp_0.6s_ease_0.2s_both]">
      <p class="m-0 mb-1 text-3xl font-normal leading-relaxed text-zinc-400">
        The essence of <span class="bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text font-semibold text-transparent">Vim</span> in a native interface
      </p>
      <p class="m-0 text-xl leading-relaxed text-zinc-500">
        {UI_TEXT.DESCRIPTION}
      </p>
    </section>

    <!-- Action buttons -->
    <section class="mb-12 flex flex-col gap-4 animate-[fadeInUp_0.6s_ease_0.3s_both]">
      <button 
        class="group relative flex cursor-pointer items-center justify-between overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30 px-6 py-5 text-lg font-medium text-zinc-400 transition-all duration-300 hover:scale-[1.02] hover:border-zinc-700 hover:bg-zinc-900/50
               {$selectedIndex === 0 ? 'translate-x-2 border-emerald-500/50 bg-emerald-500/5 text-zinc-100 shadow-[0_0_25px_rgba(16,185,129,0.1)]' : ''}" 
        onclick={handleOpenProject}
      >
        <div class="absolute top-0 -left-full h-full w-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-all duration-1000 group-hover:left-full"></div>
        <div class="flex items-center gap-4">
          <FolderOpen size="20" class="{$selectedIndex === 0 ? 'text-emerald-400' : 'text-zinc-500'}" />
          <span>Open Project</span>
        </div>
        <kbd class="rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-sm text-zinc-500">Space+O</kbd>
        {#if $selectedIndex === 0}
          <div class="absolute bottom-0 left-0 top-0 w-1 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
        {/if}
      </button>

      <button 
        class="group relative flex cursor-pointer items-center justify-between overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30 px-6 py-5 text-lg font-medium text-zinc-400 transition-all duration-300 hover:scale-[1.02] hover:border-zinc-700 hover:bg-zinc-900/50
               {$selectedIndex === 1 ? 'translate-x-2 border-emerald-500/50 bg-emerald-500/5 text-zinc-100 shadow-[0_0_25px_rgba(16,185,129,0.1)]' : ''}" 
        onclick={handleNewProject}
      >
        <div class="absolute top-0 -left-full h-full w-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-all duration-1000 group-hover:left-full"></div>
        <div class="flex items-center gap-4">
          <Plus size="20" class="{$selectedIndex === 1 ? 'text-emerald-400' : 'text-zinc-500'}" />
          <span>New Empty Project</span>
        </div>
        <kbd class="rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-sm text-zinc-500">Space+N</kbd>
        {#if $selectedIndex === 1}
          <div class="absolute bottom-0 left-0 top-0 w-1 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
        {/if}
      </button>

      <button 
        class="group relative flex cursor-pointer items-center justify-between overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30 px-6 py-5 text-lg font-medium text-zinc-400 transition-all duration-300 hover:scale-[1.02] hover:border-zinc-700 hover:bg-zinc-900/50
               {$selectedIndex === 2 ? 'translate-x-2 border-emerald-500/50 bg-emerald-500/5 text-zinc-100 shadow-[0_0_25px_rgba(16,185,129,0.1)]' : ''}" 
        onclick={handleRecentProjects}
      >
        <div class="absolute top-0 -left-full h-full w-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-all duration-1000 group-hover:left-full"></div>
        <div class="flex items-center gap-4">
          <Clock size="20" class="{$selectedIndex === 2 ? 'text-emerald-400' : 'text-zinc-500'}" />
          <span>Recent Projects</span>
        </div>
        <kbd class="rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-sm text-zinc-500">Space+R</kbd>
        {#if $selectedIndex === 2}
          <div class="absolute bottom-0 left-0 top-0 w-1 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
        {/if}
      </button>
    </section>

    <!-- Footer -->
    <footer class="opacity-60 animate-[fadeInUp_0.6s_ease_0.4s_both]">
      <p class="m-0 text-lg text-zinc-600">{UI_TEXT.KEYBOARD_SHORTCUTS_HELP}</p>
    </footer>
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
