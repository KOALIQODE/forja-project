<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { File } from "@lucide/svelte";
  import SearchBase from "./SearchBase.svelte";
  import { createSearchState } from "./searchLogic.svelte";
  import { currentProject } from "../../stores/projectStore";
  import { getFileIcon } from "$lib/utils/shared/fileIcons";
  import { GIT_STATUS_LABELS } from "$lib/utils/shared/explorerHelpers";

  const state = createSearchState('files');

  async function updateResults() {
    if (!state.query || !$currentProject) {
      state.results = [];
      return;
    }

    state.isLoading = true;
    try {
      const fileResults = await invoke<any[]>('search_files', { path: $currentProject, query: state.query });
      if (fileResults.length > 0) {
        const paths = fileResults.map((f: any) => f.path);
        const gitMap = await invoke<Record<string, string>>('get_files_git_status', {
          projectPath: $currentProject,
          filePaths: paths,
        });
        state.results = fileResults.map((f: any) => ({
          ...f,
          git_status: gitMap[f.path] ?? f.git_status ?? null,
        }));
      } else {
        state.results = fileResults;
      }
      state.selectedIdx = 0;
      state.updatePreview();
    } catch (e) {
      console.error(e);
    } finally {
      state.isLoading = false;
    }
  }

  $effect(() => {
    const q = state.query;
    const timeout = setTimeout(updateResults, 150);
    return () => clearTimeout(timeout);
  });

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
</script>

<SearchBase
  title="FIND FILES"
  bind:query={state.query}
  isLoading={state.isLoading}
  results={state.results}
  selectedIdx={state.selectedIdx}
  previewLoading={state.previewLoading}
  previewHighlightedHtml={state.previewHighlightedHtml}
  previewTitle={state.results[state.selectedIdx]?.path.split(/[/\\]/).pop()}
  onQueryChange={(q) => state.query = q}
  onKeydown={state.handleKeydown}
>
  {#snippet resultsList(results)}
    <div class="flex flex-col gap-0.5 p-2">
      {#each results as item, i}
        {@const fileIcon = getFileIcon(item.path)}
        <div
          class="result-item group flex cursor-default items-center gap-3 px-3 py-2"
          class:result-item--selected={state.selectedIdx === i}
          onclick={() => { state.selectedIdx = i; state.confirmSelection(); }}
          onmouseenter={() => { state.selectedIdx = i; state.updatePreview(); }}
        >
          <div class="file-icon-wrap flex h-7 w-7 shrink-0 items-center justify-center">
            {#if fileIcon}
              <fileIcon.icon size={14} style="color: {fileIcon.color};" />
            {:else}
              <File size={14} style="color: var(--forja-ui-text-muted, #b4b4c0);" />
            {/if}
          </div>
          <div class="flex flex-1 flex-col min-w-0">
            <div class="flex items-center gap-2">
              <span class="result-name min-w-0 truncate text-[12px] font-medium" class:result-name--active={state.selectedIdx === i}>
                {item.name}
              </span>
              {#if item.git_status}
                <span
                  class="ml-auto shrink-0 font-mono text-[9px] font-bold"
                  style="color: {gitStatusStyle(item.git_status)}"
                >{GIT_STATUS_LABELS[item.git_status] ?? '?'}</span>
              {/if}
            </div>
            <span class="result-path truncate text-[10px]">
              {item.path.replace($currentProject || '', '').replace(/^[/\\]/, '')}
            </span>
          </div>
        </div>
      {/each}
    </div>
  {/snippet}
</SearchBase>

<style>
  .result-item { color: var(--forja-ui-text-secondary, #dedee2); border-radius: 8px; transition: background 0.12s; }
  .result-item + .result-item { margin-top: 6px; }
  .result-item:hover { background: color-mix(in srgb, var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03)) 60%, transparent); }
  .result-item--selected { background: color-mix(in srgb, var(--forja-ui-picker-active, rgba(52,211,153,0.08)) 60%, transparent); }

  .file-icon-wrap { color: var(--forja-ui-text-muted, #b4b4c0); }
  .result-name { color: var(--forja-ui-text-secondary, #dedee2); }
  .result-name--active { color: var(--forja-ui-text-primary, #f4f4f5); }
  .result-path { color: var(--forja-ui-text-secondary, #dedee2); opacity: 0.7; }
</style>
