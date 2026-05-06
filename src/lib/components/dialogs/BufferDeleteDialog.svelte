<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from "@tauri-apps/api/core";
  import { Search, X, FileCode, Trash2 } from "@lucide/svelte";
  import { openBuffers, activeBufferId, closeBuffer, openBuffer } from "../../stores/bufferStore";
  import { closeDialog } from "../../stores/dialogStore";
  import { activeUITheme } from "../../stores/uiThemeStore";
  import { getFileIcon } from "../../utils/fileIcons";
  import { currentProject } from "../../stores/projectStore";
  import { GIT_STATUS_LABELS } from "../../utils/explorerHelpers";
  import { fade, scale } from 'svelte/transition';

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );

  let searchQuery = $state("");
  let selectedIndex = $state(0);
  let inputElement = $state<HTMLInputElement>();
  let gitStatuses = $state<Record<string, string>>({});

  function gitStatusStyle(status: string | undefined): string {
    switch (status) {
      case 'modified':  return 'var(--forja-ui-git-modified, #fb923c)';
      case 'added':     return 'var(--forja-ui-git-added, #4ade80)';
      case 'deleted':   return 'var(--forja-ui-git-deleted, #f87171)';
      case 'renamed':   return 'var(--forja-ui-git-renamed, #60a5fa)';
      case 'untracked': return 'var(--forja-ui-git-untracked, #9a9aaa)';
      default:          return '';
    }
  }

  // Filter buffers based on search query
  let filteredBuffers = $derived.by(() => {
    const buffers = Array.from($openBuffers.values());
    if (!searchQuery.trim()) return buffers;
    
    const query = searchQuery.toLowerCase();
    return buffers.filter(b => 
      b.filePath.toLowerCase().includes(query) || 
      (b.language && b.language.toLowerCase().includes(query))
    );
  });

  // Reset selected index when filtered list changes
  $effect(() => {
    if (selectedIndex >= filteredBuffers.length) {
      selectedIndex = Math.max(0, filteredBuffers.length - 1);
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % filteredBuffers.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + filteredBuffers.length) % filteredBuffers.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredBuffers[selectedIndex]) {
        selectBuffer(filteredBuffers[selectedIndex].id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDialog();
    } else if (e.key === 'd' && (e.ctrlKey || e.altKey)) {
      // Shortcut to delete buffer
      e.preventDefault();
      if (filteredBuffers[selectedIndex]) {
        handleCloseBuffer(filteredBuffers[selectedIndex].id);
      }
    }
  }

  function selectBuffer(id: string) {
    openBuffer(id); // This sets it as active
    closeDialog();
  }

  function handleCloseBuffer(id: string) {
    closeBuffer(id);
    if ($openBuffers.size === 0) {
      closeDialog();
    }
  }

  function getFileName(path: string) {
    return path.split(/[\/\\]/).pop() || path;
  }

  function getDirectory(path: string) {
    const parts = path.split(/[\/\\]/);
    parts.pop();
    return parts.join('/') || '.';
  }

  onMount(() => {
    inputElement?.focus();
    fetchGitStatuses();
  });

  async function fetchGitStatuses() {
    const project = $currentProject;
    if (!project) return;
    const paths = Array.from($openBuffers.values()).map(b => b.filePath);
    if (paths.length === 0) return;
    try {
      const result = await invoke<Record<string, string>>('get_files_git_status', {
        projectPath: project,
        filePaths: paths,
      });
      gitStatuses = result;
    } catch {
      // git status is best-effort
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-[2000] flex items-start justify-center pt-[15vh] px-4"
  transition:fade={{ duration: 150 }}
  onclick={closeDialog}
  style={themeStyle}
  data-program-ui
>
  <div
    class="dialog-shell relative flex w-full max-w-xl flex-col overflow-hidden outline-none"
    data-dialog-shell
    transition:scale={{ duration: 200, start: 0.98, opacity: 0 }}
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Search Input -->
    <div class="input-row flex items-center gap-3 px-4 py-3">
      <Search size={16} style="color: var(--forja-ui-text-secondary, #dedee2); flex-shrink: 0;" />
      <input
        bind:this={inputElement}
        bind:value={searchQuery}
        onkeydown={handleKeydown}
        placeholder="Find buffer..."
        class="search-input flex-1 bg-transparent text-sm focus:outline-none"
      />
      <button
        type="button"
        onclick={closeDialog}
        class="close-btn flex h-6 w-6 cursor-pointer items-center justify-center transition-all"
      >
        <X size={15} />
      </button>
    </div>

    <!-- Buffers List -->
    <div class="custom-scrollbar max-h-[400px] overflow-y-auto p-2">
      {#if filteredBuffers.length === 0}
        <div class="flex flex-col items-center justify-center py-12 text-center">
          <p class="empty-label text-xs font-medium">No open buffers matching search</p>
        </div>
      {:else}
        <div class="flex flex-col gap-0.5">
          {#each filteredBuffers as buffer, index}
            {@const isActive = buffer.id === $activeBufferId}
            {@const isSelected = index === selectedIndex}
            {@const fileIconData = getFileIcon(buffer.filePath)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="buffer-item group relative flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-all duration-75"
              class:buffer-item--selected={isSelected}
              onclick={() => selectBuffer(buffer.id)}
              onmouseenter={() => selectedIndex = index}
            >
              <div class="file-icon-wrap flex h-8 w-8 shrink-0 items-center justify-center transition-colors">
                {#if fileIconData}
                  <fileIconData.icon size={16} style="color: {fileIconData.color}" />
                {:else}
                  <FileCode size={16} />
                {/if}
              </div>

              <div class="flex flex-1 flex-col min-w-0">
                <div class="flex items-center gap-2">
                  <span class="item-name truncate text-[13px] font-medium" class:item-name--highlight={isSelected || isActive}>
                    {getFileName(buffer.filePath)}
                  </span>
                  {#if isActive}
                    <span class="active-badge px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tighter">active</span>
                  {/if}
                  {#if gitStatuses[buffer.filePath]}
                    <span
                      class="ml-auto shrink-0 font-mono text-[9px] font-bold"
                      style="color: {gitStatusStyle(gitStatuses[buffer.filePath])}"
                    >{GIT_STATUS_LABELS[gitStatuses[buffer.filePath]] ?? '?'}</span>
                  {/if}
                </div>
                <span class="item-dir truncate font-mono text-[10px] tracking-tight">{getDirectory(buffer.filePath)}</span>
              </div>

              <!-- Close Action -->
              <button
                type="button"
                class="close-item-btn flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center transition-all"
                class:opacity-100={isSelected}
                class:opacity-0={!isSelected}
                onclick={(e) => { e.stopPropagation(); handleCloseBuffer(buffer.id); }}
                title="Close buffer"
              >
                <Trash2 size={13} />
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Footer / Keybinds -->
    <footer class="footer-row flex items-center justify-between px-4 py-2">
      <div class="flex items-center gap-4 text-[10px]">
        <div class="flex items-center gap-1 kbd-hint">
          <kbd class="kbd px-1 py-0.5 font-mono">↵</kbd>
          <span>select</span>
        </div>
        <div class="flex items-center gap-1 kbd-hint">
          <kbd class="kbd px-1 py-0.5 font-mono">ctrl+d</kbd>
          <span>close</span>
        </div>
      </div>
      <div class="count-label text-[10px] font-mono">
        {filteredBuffers.length} buffer{filteredBuffers.length === 1 ? '' : 's'}
      </div>
    </footer>
  </div>
</div>

<style>
  .dialog-shell {
    background: var(--forja-ui-picker-bg, #0e0e11);
    border: 1px solid var(--forja-ui-picker-border, #2a2a2e);
    box-shadow: 0 24px 64px rgba(0,0,0,0.90), 0 8px 24px rgba(0,0,0,0.70);
  }

  .input-row {
    border-bottom: 1px solid var(--forja-ui-btn-border, #27272a);
    background: var(--forja-ui-btn-bg, #09090b);
  }

  .search-input {
    color: var(--forja-ui-text-primary, #f4f4f5);
  }
  .search-input::placeholder {
    color: var(--forja-ui-text-secondary, #dedee2);
  }

  .close-btn {
    color: var(--forja-ui-text-muted, #b4b4c0);
  }
  .close-btn:hover {
    background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.06));
    color: var(--forja-ui-text-primary, #f4f4f5);
  }

  .empty-label { color: var(--forja-ui-text-muted, #b4b4c0); }

  .buffer-item {
    color: var(--forja-ui-text-secondary, #dedee2);
  }
  .buffer-item:hover {
    background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.04));
  }
  .buffer-item--selected {
    background: var(--forja-ui-picker-active, rgba(52,211,153,0.10));
  }

  .file-icon-wrap { color: var(--forja-ui-text-muted, #b4b4c0); }

  .item-name { color: var(--forja-ui-text-secondary, #dedee2); }
  .item-name--highlight { color: var(--forja-ui-text-primary, #f4f4f5); }

  .active-badge {
    background: color-mix(in srgb, var(--forja-ui-gradient-from, #34d399) 12%, transparent);
    color: var(--forja-ui-gradient-from, #34d399);
  }

  .item-dir { color: var(--forja-ui-text-secondary, #dedee2); }

  .close-item-btn {
    color: var(--forja-ui-text-muted, #b4b4c0);
  }
  .close-item-btn:hover {
    background: rgba(239,68,68,0.10);
    color: #f87171;
  }

  .footer-row {
    border-top: 1px solid var(--forja-ui-btn-border, #27272a);
    background: color-mix(in srgb, var(--forja-ui-btn-bg, #09090b) 50%, transparent);
  }

  .kbd-hint { color: var(--forja-ui-text-muted, #b4b4c0); }

  .kbd {
    border: 1px solid var(--forja-ui-btn-border, #27272a);
    background: var(--forja-ui-btn-bg, #09090b);
    color: var(--forja-ui-text-secondary, #dedee2);
    font-size: 9px;
  }

  .count-label { color: var(--forja-ui-text-muted, #b4b4c0); }

  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--forja-ui-explorer-scrollbar, #1e1e1e);
    border-radius: 10px;
  }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background: var(--forja-ui-explorer-scrollbar-hover, #2e2e2e);
  }
</style>