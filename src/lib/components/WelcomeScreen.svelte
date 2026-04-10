<script lang="ts">
  import { FolderOpen, Plus, Clock } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { openProject } from "../stores/projectStore";
  import { openRecentProjectsDialog } from "../stores/dialogStore";
  import { keyboardManager } from "../utils/keyboardManager";
  import { open } from "@tauri-apps/plugin-dialog";
  import { 
    UI_TEXT, 
    ERROR_MESSAGES,
    KEYBOARD_CONTEXTS,
    SHORTCUTS_FLAT
  } from "../utils/constants";

  // Simulamos obtener la versión del sistema - en producción vendrá de Tauri
  const version = "1.0.0-alpha";

  let welcomeContainer: HTMLElement;

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

  onMount(() => {
    // Register keyboard shortcuts for this view
    keyboardManager.registerContext(KEYBOARD_CONTEXTS.WELCOME_SCREEN, [
      {
        key: SHORTCUTS_FLAT.OPEN_PROJECT,
        handler: handleOpenProject,
        description: UI_TEXT.OPEN_PROJECT
      },
      {
        key: SHORTCUTS_FLAT.NEW_PROJECT,
        handler: handleNewProject,
        description: UI_TEXT.NEW_EMPTY_PROJECT
      },
      {
        key: SHORTCUTS_FLAT.RECENT_PROJECTS,
        handler: handleRecentProjects,
        description: UI_TEXT.RECENT_PROJECTS
      }
    ]);
    
    keyboardManager.setActiveContext(KEYBOARD_CONTEXTS.WELCOME_SCREEN);
    keyboardManager.startListening();
  });
</script>

<main 
  class="flex h-full w-full items-center justify-center outline-none" 
  bind:this={welcomeContainer}
>
  <div class="w-full max-w-[480px] px-8 py-12 text-center">
    <!-- Header section -->
    <header class="mb-10 animate-[fadeInUp_0.6s_ease_0.1s_both]">
      <h1 class="m-0 mb-3 text-4xl font-light leading-[1.1] tracking-tight">
        <span class="font-semibold text-zinc-100">{UI_TEXT.APP_TITLE}</span>
        <span class="font-light text-zinc-500">{UI_TEXT.APP_SUBTITLE}</span>
      </h1>
      <p class="m-0 text-base font-medium text-zinc-600 opacity-80">v{version}</p>
    </header>

    <!-- Tagline -->
    <section class="mb-14 animate-[fadeInUp_0.6s_ease_0.2s_both]">
      <p class="m-0 mb-1 text-2xl font-normal leading-relaxed text-zinc-400">
        Forge your <span class="bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text font-semibold text-transparent">workflow</span>
      </p>
      <p class="m-0 text-lg leading-relaxed text-zinc-500">
        {UI_TEXT.DESCRIPTION}
      </p>
    </section>

    <!-- Action buttons -->
    <section class="mb-10 flex flex-col gap-3 animate-[fadeInUp_0.6s_ease_0.3s_both] text-[13px]">
      <button 
        class="group relative flex cursor-pointer items-center justify-between overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30 px-5 py-4 font-medium text-zinc-400 transition-all duration-300 hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:text-zinc-100 hover:shadow-[0_0_25px_rgba(16,185,129,0.1)]" 
        onclick={handleOpenProject}
      >
        <div class="absolute top-0 -left-full h-full w-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-all duration-1000 group-hover:left-full"></div>
        <div class="flex items-center gap-4">
          <FolderOpen size="15" class="text-zinc-500 transition-colors group-hover:text-emerald-400" />
          <span>{UI_TEXT.OPEN_PROJECT}</span>
        </div>
        <kbd class="rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-zinc-500">Space+O</kbd>
      </button>

      <button 
        class="group relative flex cursor-pointer items-center justify-between overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30 px-5 py-4 font-medium text-zinc-400 transition-all duration-300 hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:text-zinc-100 hover:shadow-[0_0_25px_rgba(16,185,129,0.1)]" 
        onclick={handleNewProject}
      >
        <div class="absolute top-0 -left-full h-full w-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-all duration-1000 group-hover:left-full"></div>
        <div class="flex items-center gap-4">
          <Plus size="15" class="text-zinc-500 transition-colors group-hover:text-emerald-400" />
          <span>{UI_TEXT.NEW_EMPTY_PROJECT}</span>
        </div>
        <kbd class="rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-zinc-500">Space+N</kbd>
      </button>

      <button 
        class="group relative flex cursor-pointer items-center justify-between overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30 px-5 py-4 font-medium text-zinc-400 transition-all duration-300 hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:text-zinc-100 hover:shadow-[0_0_25px_rgba(16,185,129,0.1)]" 
        onclick={handleRecentProjects}
      >
        <div class="absolute top-0 -left-full h-full w-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-all duration-1000 group-hover:left-full"></div>
        <div class="flex items-center gap-4">
          <Clock size="15" class="text-zinc-500 transition-colors group-hover:text-emerald-400" />
          <span>{UI_TEXT.RECENT_PROJECTS}</span>
        </div>
        <kbd class="rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-zinc-500">Space+R</kbd>
      </button>
    </section>

    <!-- Footer -->
    <footer class="flex items-center justify-center gap-2 opacity-60 animate-[fadeInUp_0.6s_ease_0.4s_both]">
      <span class="text-sm font-medium text-zinc-600">Press</span>
      <kbd class="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-0.5 font-mono text-[13px] font-bold text-emerald-500/80 shadow-sm">?</kbd>
      <span class="text-sm font-medium text-zinc-600">for keyboard shortcuts</span>
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
