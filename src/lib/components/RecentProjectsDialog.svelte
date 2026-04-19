<script lang="ts">
  import { FolderOpen, Clock, X, Trash2, Globe, GitBranch, ArrowUp, ArrowDown } from "@lucide/svelte";
  import {
    recentProjects,
    openProject,
    shortenedPaths,
    gitStatuses,
  } from "../stores/projectStore";
  import {
    UI_TEXT,
  } from "../utils/constants.js";
  import { fade, scale } from 'svelte/transition';

  let {
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  } = $props();

  let selectedIndex = $state(0);
  let dialogElement = $state<HTMLElement>();

  function getDisplayPath(index: number): string {
    return $shortenedPaths[index] || $recentProjects[index] || "";
  }

  function openSelectedProject(index: number, projectPath: string) {
    console.log("Opening project:", projectPath);
    openProject(projectPath);
    onClose();
  }

  function getProjectName(path: string): string {
    return path.split(/[/\\]/).pop() || "Unknown Project";
  }

  function deleteProject(index: number) {
    recentProjects.update((projects) => {
      const newProjects = [...projects];
      newProjects.splice(index, 1);
      return newProjects;
    });
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
    transition:fade={{ duration: 150 }}
    onclick={onClose}
  >
    <!-- Dialog Container -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-zinc-800 bg-zinc-950/90 shadow-2xl shadow-black/50 outline-none"
      bind:this={dialogElement}
      transition:scale={{ duration: 200, start: 0.95, opacity: 0 }}
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <header class="flex items-center justify-between border-b border-zinc-800/50 bg-zinc-900/30 px-6 py-4">
        <div class="flex items-center gap-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <Clock size={18} />
          </div>
          <h3 class="text-base font-semibold tracking-tight text-zinc-100">{UI_TEXT.RECENT_PROJECTS_TITLE}</h3>
        </div>
        <button 
          type="button"
          class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-zinc-500 transition-all hover:bg-white/5 hover:text-zinc-100" 
          onclick={onClose}
        >
          <X size={18} />
        </button>
      </header>

      <!-- Projects List -->
      <div class="custom-scrollbar max-h-[450px] overflow-y-auto bg-zinc-950/20 p-2">
        {#if $recentProjects.length === 0}
          <div class="flex flex-col items-center justify-center py-20 text-center">
            <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 text-zinc-700">
              <FolderOpen size={32} />
            </div>
            <p class="text-sm font-medium text-zinc-500">{UI_TEXT.NO_RECENT_PROJECTS}</p>
          </div>
        {:else}
          <div class="flex flex-col gap-1">
            {#each $recentProjects as project, index}
              {@const git = $gitStatuses[index]}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="project-item group relative flex w-full cursor-pointer items-center gap-4 rounded-lg border border-transparent px-4 py-3 text-left transition-all duration-150 hover:bg-white/[0.03]"
                onclick={() => openSelectedProject(index, project)}
              >
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-zinc-500 transition-colors group-hover:text-emerald-400">
                  <FolderOpen size={20} />
                </div>
                
                <div class="flex flex-1 flex-col min-w-0">
                  <span class="truncate text-[14px] font-semibold tracking-tight text-zinc-100">{getProjectName(project)}</span>
                  <span class="truncate font-mono text-[10px] text-zinc-500 tracking-tighter">{getDisplayPath(index)}</span>
                </div>

                <!-- Git Metadata -->
                {#if git}
                  <div class="flex items-center gap-4 shrink-0 px-4">
                    {#if git.is_repo}
                      <div class="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/50 px-2.5 py-1">
                        <GitBranch size={12} class="text-emerald-500/70" />
                        <span class="font-mono text-[11px] font-medium text-zinc-400">{git.branch}</span>
                      </div>
                      
                      {#if git.has_upstream}
                        <div class="flex items-center gap-2">
                          <div class="flex items-center gap-1 text-zinc-500">
                            <ArrowUp size={12} class={git.ahead > 0 ? 'text-blue-400' : ''} />
                            <span class="font-mono text-[11px]">{git.ahead}</span>
                          </div>
                          <div class="flex items-center gap-1 text-zinc-500">
                            <ArrowDown size={12} class={git.behind > 0 ? 'text-orange-400' : ''} />
                            <span class="font-mono text-[11px]">{git.behind}</span>
                          </div>
                        </div>
                      {:else}
                        <span class="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-500/70">
                          <Globe size={11} /> {UI_TEXT.PUBLISH}
                        </span>
                      {/if}
                    {:else}
                      <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-700">{UI_TEXT.NO_GIT}</span>
                    {/if}
                  </div>
                {/if}

                <!-- Delete Action -->
                <button 
                  type="button"
                  class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-zinc-700 transition-all hover:bg-red-500/10 hover:text-red-400 opacity-0 group-hover:opacity-100"
                  onclick={(e) => { e.stopPropagation(); deleteProject(index); }}
                  title="Remove from recent list"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <!-- <footer class="border-t border-zinc-800/50 bg-zinc-900/30 px-6 py-3">
        <div class="flex items-center justify-end text-[11px] text-zinc-500 font-medium">
          <div class="flex items-center gap-1.5">
            <kbd class="flex min-w-[20px] items-center justify-center rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-300 shadow-sm">Esc</kbd>
            <span>{UI_TEXT.CLOSE}</span>
          </div>
        </div>
      </footer> -->
    </div>
  </div>
{/if}

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 10px; }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: #2a2a2a; }
</style>