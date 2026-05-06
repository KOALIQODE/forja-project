<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { invoke } from "@tauri-apps/api/core";
  import { get } from 'svelte/store';
  import { Search, File, X } from "@lucide/svelte";
  import { closeDialog } from "../../stores/dialogStore";
  import { currentProject } from "../../stores/projectStore";
  import { openBuffer, openBuffers } from "../../stores/bufferStore";
  import { getFileIcon } from "../../utils/fileIcons";
  import { activeTheme } from "../../stores/pluginStore";
  import { activeUITheme } from "../../stores/uiThemeStore";
  import { GIT_STATUS_LABELS } from "../../utils/explorerHelpers";
  import { TOKEN_COLORS } from "../../utils/constants";

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

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );

  interface Props {
    mode: 'files' | 'grep' | 'buffers';
  }

  let { mode = 'files' }: Props = $props();

  let query = $state('');
  let results = $state<any[]>([]);
  let selectedIdx = $state(0);
  let isLoading = $state(false);
  let inputElement = $state<HTMLInputElement | null>(null);
  let previewContent = $state<string>('');
  let previewHighlightedHtml = $state<string>('');
  let previewLoading = $state(false);

  // Buffer results helper
  function getBuffers() {
    const buffers = Array.from(get(openBuffers).values());
    return buffers.map((b: { filePath: string }) => ({
      name: b.filePath.split(/[/\\]/).pop(),
      path: b.filePath,
      is_dir: false,
    }));
  }

  async function updateResults() {
    if (mode === 'buffers') {
      const all = getBuffers();
      results = all.filter(b => 
        b.name?.toLowerCase().includes(query.toLowerCase()) || 
        b.path.toLowerCase().includes(query.toLowerCase())
      );
      selectedIdx = 0;
      updatePreview();
      return;
    }

    if (!query && mode === 'files') {
        results = [];
        return;
    }

    isLoading = true;
    try {
      if (mode === 'files') {
        const fileResults = await invoke<any[]>('search_files', { path: $currentProject, query });
        // Fetch git statuses separately for reliability
        if (fileResults.length > 0 && $currentProject) {
          try {
            const paths = fileResults.map((f: any) => f.path);
            const gitMap = await invoke<Record<string, string>>('get_files_git_status', {
              projectPath: $currentProject,
              filePaths: paths,
            });
            results = fileResults.map((f: any) => ({
              ...f,
              git_status: gitMap[f.path] ?? f.git_status ?? null,
            }));
          } catch (e) {
            console.error('[Telescope] get_files_git_status failed:', e);
            results = fileResults;
          }
        } else {
          results = fileResults;
        }
      } else if (mode === 'grep') {
        if (!query) {
            results = [];
            return;
        }
        const grepResults = await invoke<any[]>('search_in_files', { path: $currentProject, query });
        // Flatten grep results (backend already dedups files)
        results = [];
        for (const file of grepResults) {
          for (const m of file.matches) {
            results.push({
              path: file.path,
              name: file.path.split(/[/\\]/).pop(),
              line_num: m.line_num,
              col_num: m.col_num,
              line_content: m.line_content,
              is_grep: true
            });
          }
        }
      }
      selectedIdx = 0;
      updatePreview();
    } catch (e) {
      console.error(e);
    } finally {
      isLoading = false;
    }
  }

  // Build token color map from activeTheme, same as EditorBuffer does
  let tokenColors = $derived.by(() => {
    const s = $activeTheme?.syntax;
    if (!s) return TOKEN_COLORS;
    return {
      ...TOKEN_COLORS,
      Keyword:     s.keyword       ?? TOKEN_COLORS.Keyword,
      Function:    s.function_name ?? TOKEN_COLORS.Function,
      Type:        s.type          ?? TOKEN_COLORS.Type,
      String:      s.string        ?? TOKEN_COLORS.String,
      Comment:     s.comment       ?? TOKEN_COLORS.Comment,
      Number:      s.number        ?? TOKEN_COLORS.Number,
      Punctuation: s.punctuation   ?? TOKEN_COLORS.Punctuation,
      Operator:    s.operator      ?? TOKEN_COLORS.Operator,
      Variable:    s.variable      ?? TOKEN_COLORS.Variable,
      Property:    s.variable      ?? TOKEN_COLORS.Property,
      Constant:    s.constant      ?? TOKEN_COLORS.Constant,
      Attribute:   s.attribute     ?? TOKEN_COLORS.Attribute,
      Boolean:     s.constant      ?? TOKEN_COLORS.Boolean,
    };
  });

  function tokenTypeToColor(tokenType: string): string {
    return (tokenColors as Record<string, string>)[tokenType] ?? TOKEN_COLORS.Unknown;
  }

  function renderTokensToHtml(tokens: Array<{ text: string; token_type: string }>): string {
    return tokens.map(token => {
      const safe = escapeHtml(token.text);
      const color = tokenTypeToColor(token.token_type);
      return `<span style="color:${color}">${safe}</span>`;
    }).join('');
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlightText(text: string, term: string) {
    const safe = escapeHtml(text);
    if (!term || mode === 'files') return safe;
    try {
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedTerm})`, 'gi');
      return safe.replace(regex, '<mark class="bg-emerald-500/20 text-emerald-400 px-0.5 border-b border-emerald-500/30">$1</mark>');
    } catch {
      return safe;
    }
  }

  async function updatePreview() {
    const selected = results[selectedIdx];
    if (!selected) {
      previewContent = '';
      previewHighlightedHtml = '';
      return;
    }

    previewLoading = true;
    try {
      const start = selected.is_grep ? Math.max(0, (selected.line_num || 0) - 10) : 0;
      const end = start + 50;

      const lines = await invoke<string[]>("read_file_lines", {
        path: selected.path,
        startLine: start,
        endLine: end,
      });

      const text = lines.join('\n');
      previewContent = text;

      try {
        const lang = await invoke<string>('detect_language', { filePath: selected.path });
        if (lang && lang !== 'unknown') {
          const result = await invoke<{ tokens: Array<{ text: string; token_type: string }> }>(
            'highlight_syntax',
            { content: text, language: lang }
          );
          previewHighlightedHtml = renderTokensToHtml(result.tokens);
        } else {
          previewHighlightedHtml = escapeHtml(text);
        }
      } catch {
        previewHighlightedHtml = escapeHtml(text);
      }
    } catch (e) {
      previewContent = 'Error loading preview';
      previewHighlightedHtml = 'Error loading preview';
    } finally {
      previewLoading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closeDialog();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % results.length;
      updatePreview();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + results.length) % results.length;
      updatePreview();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      confirmSelection();
    }
  }

  function confirmSelection() {
    const selected = results[selectedIdx];
    if (selected) {
      openBuffer(selected.path);
      closeDialog();
    }
  }

  $effect(() => {
    const q = query;
    const timeout = setTimeout(() => {
      updateResults();
    }, 150);
    return () => clearTimeout(timeout);
  });

  onMount(() => {
    inputElement?.focus();
    if (mode === 'buffers') updateResults();

    // Bloquear scroll externo y eventos de puntero en el fondo
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.body.style.overflow = '';
    };
  });

  function getModeLabel() {
    switch (mode) {
      case 'files': return 'FIND FILES';
      case 'grep': return 'LIVE GREP';
      case 'buffers': return 'BUFFERS';
      default: return 'TELESCOPE';
    }
  }

  function getIcon(path: string) {
    return getFileIcon(path);
  }
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-[100] flex items-center justify-center p-8"
  onclick={(e) => e.target === e.currentTarget && closeDialog()}
  style={themeStyle}
  data-program-ui
>
  <div
    class="telescope-shell flex h-full w-full max-w-5xl flex-col overflow-hidden"
    data-dialog-shell
    onkeydown={handleKeydown}
  >
    <!-- Header/Input Area -->
    <div class="header-row flex items-center gap-3 px-4 py-2.5">
      <span class="mode-label">{getModeLabel()}</span>
      <div class="sep-v"></div>
      <div class="relative flex flex-1 items-center">
        <Search size={13} style="color: var(--forja-ui-text-secondary, #dedee2); position: absolute; left: 0;" />
        <input
          bind:this={inputElement}
          bind:value={query}
          type="text"
          placeholder="Search..."
          class="search-input w-full bg-transparent pl-5 text-[13px] outline-none"
        />
      </div>
      <div class="flex items-center gap-2">
        {#if isLoading}
          <div class="loader"></div>
        {/if}
        <button onclick={closeDialog} class="close-btn flex h-6 w-6 items-center justify-center">
          <X size={14} />
        </button>
      </div>
    </div>

    <!-- Content Area: Two Panes -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Left Pane: Results -->
      <div class="left-pane flex w-[38%] flex-col">
        <div class="flex-1 overflow-y-auto custom-scrollbar">
          {#if results.length === 0 && !isLoading}
            <div class="empty-state flex h-full flex-col items-center justify-center gap-1.5">
              <Search size={28} strokeWidth={1} />
              <p class="text-[10px] uppercase tracking-widest">No results</p>
            </div>
          {:else}
            {#each results as item, i}
              {@const fileIcon = getIcon(item.path)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="result-item flex cursor-default flex-col px-3 py-2"
                class:result-item--selected={selectedIdx === i}
                onclick={() => { selectedIdx = i; confirmSelection(); }}
                onmouseenter={() => { selectedIdx = i; updatePreview(); }}
              >
                <div class="flex items-center gap-2">
                  {#if fileIcon}
                    <fileIcon.icon size={13} style="color: {fileIcon.color}; flex-shrink: 0;" />
                  {:else}
                    <File size={13} style="color: var(--forja-ui-text-muted, #b4b4c0); flex-shrink: 0;" />
                  {/if}
                  <span class="result-name truncate text-[12px]" class:result-name--active={selectedIdx === i}>
                    {item.name}
                  </span>
                  {#if item.git_status && !item.is_grep}
                    <span
                      class="ml-auto shrink-0 font-mono text-[9px] font-bold"
                      style="color: {gitStatusStyle(item.git_status)}"
                    >{GIT_STATUS_LABELS[item.git_status] ?? '?'}</span>
                  {/if}
                </div>
                <div class="flex flex-col gap-0.5 overflow-hidden pl-[21px]">
                  <span class="result-path truncate text-[10px]">
                    {item.path.replace($currentProject || '', '').replace(/^[/\\]/, '')}
                  </span>
                  {#if item.is_grep}
                    <div class="grep-line truncate pl-2 text-[11px] leading-relaxed">
                      {@html highlightText(item.line_content.trim(), query)}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          {/if}
        </div>

        <!-- Bottom Info -->
        <div class="footer-row flex items-center justify-between px-3 py-1.5 text-[9px] uppercase tracking-[0.12em]">
          <div class="flex gap-3">
            <span class="kbd-hint"><b class="kbd-key">↵</b> open</span>
            <span class="kbd-hint"><b class="kbd-key">esc</b> close</span>
          </div>
          <span class="match-count">{results.length}</span>
        </div>
      </div>

      <!-- Right Pane: Preview -->
      <div class="preview-pane relative flex-1">
        {#if previewLoading}
          <div class="flex h-full items-center justify-center">
            <div class="loader"></div>
          </div>
        {:else if previewHighlightedHtml}
          <div class="absolute inset-0 flex flex-col overflow-hidden font-mono text-[11px] leading-relaxed">
            <div class="preview-header flex items-center gap-2 px-4 py-2 text-[10px] tracking-[0.08em] uppercase">
              <span class="truncate">{results[selectedIdx]?.path.split(/[/\\]/).pop()}</span>
              {#if results[selectedIdx]?.is_grep}
                <span class="ml-auto line-ref">:{results[selectedIdx].line_num + 1}</span>
              {/if}
            </div>
            <pre class="flex-1 overflow-auto px-4 py-3 whitespace-pre custom-scrollbar preview-code"><code>{@html previewHighlightedHtml}</code></pre>
          </div>
        {:else}
          <div class="empty-state flex h-full flex-col items-center justify-center gap-1.5">
            <File size={28} strokeWidth={1} />
            <p class="text-[10px] uppercase tracking-[0.2em]">No preview</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .telescope-shell {
    background: var(--forja-ui-picker-bg, #0e0e11);
    border: 1px solid var(--forja-ui-btn-border, #27272a);
    box-shadow: 0 24px 64px rgba(0,0,0,0.90), 0 8px 24px rgba(0,0,0,0.70);
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

  .search-input {
    color: var(--forja-ui-text-primary, #f4f4f5);
  }
  .search-input::placeholder { color: var(--forja-ui-text-secondary, #dedee2); }

  .loader {
    width: 12px;
    height: 12px;
    border: 1px solid var(--forja-ui-btn-border, #27272a);
    border-top-color: var(--forja-ui-text-muted, #b4b4c0);
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .close-btn {
    color: var(--forja-ui-text-muted, #b4b4c0);
  }
  .close-btn:hover { color: var(--forja-ui-text-primary, #f4f4f5); }

  .left-pane {
    border-right: 1px solid var(--forja-ui-btn-border, #27272a);
  }

  .empty-state {
    color: var(--forja-ui-text-secondary, #dedee2);
    opacity: 0.6;
  }

  .result-item { color: var(--forja-ui-text-secondary, #dedee2); }
  .result-item:hover { background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03)); }
  .result-item--selected { background: var(--forja-ui-picker-active, rgba(52,211,153,0.08)); }

  .result-name { color: var(--forja-ui-text-secondary, #dedee2); }
  .result-name--active { color: var(--forja-ui-text-primary, #f4f4f5); }

  .result-path { color: var(--forja-ui-text-secondary, #dedee2); }

  .grep-line {
    border-left: 1px solid var(--forja-ui-btn-border, #27272a);
    color: var(--forja-ui-text-secondary, #dedee2);
  }

  .footer-row {
    border-top: 1px solid var(--forja-ui-btn-border, #27272a);
    color: var(--forja-ui-text-muted, #b4b4c0);
  }
  .kbd-hint { color: var(--forja-ui-text-muted, #b4b4c0); }
  .kbd-key { color: var(--forja-ui-text-secondary, #dedee2); font-style: normal; }
  .match-count { color: var(--forja-ui-text-muted, #b4b4c0); }

  .preview-pane {
    background: var(--forja-ui-explorer-bg, #0a0a0a);
  }

  .preview-header {
    border-bottom: 1px solid var(--forja-ui-btn-border, #27272a);
    color: var(--forja-ui-text-secondary, #dedee2);
  }
  .line-ref { color: var(--forja-ui-text-secondary, #dedee2); }

  .preview-code { color: var(--forja-ui-text-primary, #f4f4f5); }

  .custom-scrollbar::-webkit-scrollbar { width: 3px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--forja-ui-explorer-scrollbar, #1e1e1e);
  }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background: var(--forja-ui-explorer-scrollbar-hover, #2e2e2e);
  }
</style>
