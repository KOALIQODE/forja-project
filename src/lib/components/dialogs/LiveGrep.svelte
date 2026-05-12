<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { File } from "@lucide/svelte";
  import SearchBase from "./SearchBase.svelte";
  import { createSearchState } from "./searchLogic.svelte";
  import { currentProject } from "../../stores/projectStore";
  import { getFileIcon } from "../../utils/fileIcons";

  const state = createSearchState('grep');

  async function updateResults() {
    if (!state.query || !$currentProject) {
      state.results = [];
      return;
    }

    state.isLoading = true;
    try {
      const grepResults = await invoke<any[]>('search_in_files', { path: $currentProject, query: state.query });
      state.results = [];
      for (const file of grepResults) {
        for (const m of file.matches) {
          state.results.push({
            path: file.path,
            name: file.path.split(/[/\\]/).pop(),
            line_num: m.line_num,
            col_num: m.col_num,
            line_content: m.line_content,
            is_grep: true
          });
        }
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

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlightText(text: string, term: string) {
    const safe = escapeHtml(text);
    if (!term) return safe;
    try {
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedTerm})`, 'gi');
      return safe.replace(regex, '<mark class="bg-emerald-500/20 text-emerald-400 px-0.5 border-b border-emerald-500/30">$1</mark>');
    } catch {
      return safe;
    }
  }
</script>

<SearchBase
  title="LIVE GREP"
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
              {#if item.line_num !== undefined}
                <span class="ml-auto shrink-0 font-mono text-[9px] text-emerald-500/70">:{item.line_num + 1}</span>
              {/if}
            </div>
            <span class="result-path truncate text-[10px]">
              {item.path.replace($currentProject || '', '').replace(/^[/\\]/, '')}
            </span>
            <div class="grep-line truncate text-[11px] leading-relaxed">
              {@html highlightText(item.line_content.trim(), state.query)}
            </div>
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

  .grep-line {
    border-left: 1px solid var(--forja-ui-btn-border, #27272a);
    padding-left: 0.5rem;
    color: var(--forja-ui-text-secondary, #dedee2);
  }
</style>
