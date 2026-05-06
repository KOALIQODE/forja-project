<script lang="ts">
  import { FolderOpen, X, Trash2, Globe, GitBranch, ArrowUp, ArrowDown } from "@lucide/svelte";
  import {
    recentProjects,
    openProject,
    shortenedPaths,
    gitStatuses,
  } from "../stores/projectStore";
  import { UI_TEXT } from "../utils/constants.js";
  import { activeUITheme } from "../stores/uiThemeStore";

  let {
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  } = $props();

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );

  let selectedIndex = $state(0);

  function getDisplayPath(index: number): string {
    return $shortenedPaths[index] || $recentProjects[index] || "";
  }

  function openSelectedProject(index: number, projectPath: string) {
    openProject(projectPath);
    onClose();
  }

  function getProjectName(path: string): string {
    return path.split(/[/\\]/).pop() || "Unknown Project";
  }

  function deleteProject(index: number) {
    recentProjects.update((projects) => {
      const updated = [...projects];
      updated.splice(index, 1);
      if (selectedIndex >= updated.length) selectedIndex = Math.max(0, updated.length - 1);
      return updated;
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % $recentProjects.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + $recentProjects.length) % $recentProjects.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if ($recentProjects[selectedIndex]) {
        openSelectedProject(selectedIndex, $recentProjects[selectedIndex]);
      }
    }
  }
</script>

{#if isOpen}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-[2000] flex items-start justify-center pt-[15%]"
  onclick={(e) => e.target === e.currentTarget && onClose()}
  style={themeStyle}
  data-program-ui
  onkeydown={handleKeydown}
>
  <div class="recent-shell flex w-full max-w-2xl flex-col overflow-hidden">

    <!-- Header -->
    <div class="header-row flex items-center gap-3 px-4 py-2.5">
      <span class="mode-label">RECENT PROJECTS</span>
      <div class="sep-v"></div>
      <span class="hint-text flex-1 text-[11px]">Open a recent project</span>
      <button onclick={onClose} class="close-btn flex h-6 w-6 items-center justify-center">
        <X size={14} />
      </button>
    </div>

    <!-- List -->
    <div class="custom-scrollbar max-h-[400px] overflow-y-auto">
      {#if $recentProjects.length === 0}
        <div class="empty-state flex flex-col items-center justify-center gap-2 py-16">
          <FolderOpen size={24} strokeWidth={1} />
          <p class="text-[10px] uppercase tracking-widest">{UI_TEXT.NO_RECENT_PROJECTS}</p>
        </div>
      {:else}
        {#each $recentProjects as project, index}
          {@const git = $gitStatuses[index]}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="item-row group flex cursor-default items-center gap-3 px-4 py-2.5"
            class:item-row--selected={selectedIndex === index}
            onclick={() => openSelectedProject(index, project)}
            onmouseenter={() => { selectedIndex = index; }}
          >
            <FolderOpen size={13} class="item-icon shrink-0" />

            <div class="flex min-w-0 flex-1 flex-col">
              <span class="item-name truncate text-[12px]" class:item-name--active={selectedIndex === index}>
                {getProjectName(project)}
              </span>
              <span class="item-path truncate font-mono text-[10px]">
                {getDisplayPath(index)}
              </span>
            </div>

            <!-- Git info -->
            {#if git}
              <div class="flex shrink-0 items-center gap-3">
                {#if git.is_repo}
                  <div class="git-branch flex items-center gap-1">
                    <GitBranch size={10} />
                    <span class="font-mono text-[10px]">{git.branch}</span>
                  </div>
                  {#if git.has_upstream}
                    <div class="flex items-center gap-1.5">
                      <span class="flex items-center gap-0.5 font-mono text-[10px]" class:git-ahead={git.ahead > 0}>
                        <ArrowUp size={10} />{git.ahead}
                      </span>
                      <span class="flex items-center gap-0.5 font-mono text-[10px]" class:git-behind={git.behind > 0}>
                        <ArrowDown size={10} />{git.behind}
                      </span>
                    </div>
                  {:else}
                    <span class="git-publish flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                      <Globe size={9} />{UI_TEXT.PUBLISH}
                    </span>
                  {/if}
                {:else}
                  <span class="git-none text-[9px] uppercase tracking-widest">{UI_TEXT.NO_GIT}</span>
                {/if}
              </div>
            {/if}

            <!-- Delete -->
            <button
              type="button"
              class="delete-btn flex h-6 w-6 shrink-0 items-center justify-center opacity-0 group-hover:opacity-100"
              onclick={(e) => { e.stopPropagation(); deleteProject(index); }}
              title="Remove from recent"
            >
              <Trash2 size={12} />
            </button>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Footer -->
    <div class="footer-row flex items-center justify-between px-3 py-1.5 text-[9px] uppercase tracking-[0.12em]">
      <div class="flex gap-3">
        <span class="kbd-hint"><b class="kbd-key">↵</b> open</span>
        <span class="kbd-hint"><b class="kbd-key">↑↓</b> navigate</span>
        <span class="kbd-hint"><b class="kbd-key">esc</b> close</span>
      </div>
      <span class="match-count">{$recentProjects.length}</span>
    </div>

  </div>
</div>
{/if}

<style>
  .recent-shell {
    background: var(--forja-ui-picker-bg, #0e0e11);
    border: 1px solid var(--forja-ui-btn-border, #27272a);
  }

  .header-row {
    border-bottom: 1px solid var(--forja-ui-btn-border, #27272a);
  }

  .mode-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--forja-ui-gradient-from, #34d399);
    white-space: nowrap;
  }

  .sep-v {
    width: 1px;
    height: 12px;
    flex-shrink: 0;
    background: var(--forja-ui-btn-border, #27272a);
  }

  .hint-text { color: var(--forja-ui-text-muted, #b4b4c0); }

  .close-btn { color: var(--forja-ui-text-muted, #b4b4c0); }
  .close-btn:hover { color: var(--forja-ui-text-primary, #f4f4f5); }

  .item-row {
    border-bottom: 1px solid var(--forja-ui-btn-border, #27272a);
    color: var(--forja-ui-text-secondary, #dedee2);
  }
  .item-row:hover { background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03)); }
  .item-row--selected { background: var(--forja-ui-picker-active, rgba(52,211,153,0.08)); }

  :global(.item-icon) { color: var(--forja-ui-text-muted, #b4b4c0); }
  .item-name { color: var(--forja-ui-text-secondary, #dedee2); }
  .item-name--active { color: var(--forja-ui-text-primary, #f4f4f5); }
  .item-path { color: var(--forja-ui-text-muted, #b4b4c0); }

  .git-branch { color: var(--forja-ui-text-muted, #b4b4c0); }
  .git-ahead { color: #60a5fa; }
  .git-behind { color: #fb923c; }
  .git-publish {
    color: var(--forja-ui-gradient-from, #34d399);
    border: 1px solid color-mix(in srgb, var(--forja-ui-gradient-from, #34d399) 20%, transparent);
    background: color-mix(in srgb, var(--forja-ui-gradient-from, #34d399) 6%, transparent);
  }
  .git-none { color: var(--forja-ui-text-muted, #b4b4c0); opacity: 0.4; }

  .delete-btn { color: var(--forja-ui-text-muted, #b4b4c0); }
  .delete-btn:hover { color: #f87171; }

  .empty-state {
    color: var(--forja-ui-text-secondary, #dedee2);
    opacity: 0.5;
  }

  .footer-row {
    border-top: 1px solid var(--forja-ui-btn-border, #27272a);
    color: var(--forja-ui-text-muted, #b4b4c0);
  }
  .kbd-hint { color: var(--forja-ui-text-muted, #b4b4c0); }
  .kbd-key { color: var(--forja-ui-text-secondary, #dedee2); font-style: normal; }
  .match-count { color: var(--forja-ui-text-muted, #b4b4c0); }

  .custom-scrollbar::-webkit-scrollbar { width: 3px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--forja-ui-explorer-scrollbar, #1e1e1e);
  }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background: var(--forja-ui-explorer-scrollbar-hover, #2e2e2e);
  }
</style>