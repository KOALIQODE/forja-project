<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { invoke } from "@tauri-apps/api/core";
  import { get } from 'svelte/store';
  import { Search, File, List, Command, ChevronRight, X } from "@lucide/svelte";
  import { closeDialog } from "../../stores/dialogStore";
  import { currentProject } from "../../stores/projectStore";
  import { openBuffer, openBuffers } from "../../stores/bufferStore";
  import { getFileIcon } from "../../utils/fileIcons";
  import { activeTheme } from "../../stores/pluginStore";
  import { TOKEN_COLORS } from "../../utils/constants";

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
        results = await invoke('search_files', { path: $currentProject, query });
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
      return safe.replace(regex, '<mark class="bg-emerald-500/20 text-emerald-400 rounded-sm px-0.5 border-b border-emerald-500/30">$1</mark>');
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
  class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-12 transition-all duration-300"
  onclick={(e) => e.target === e.currentTarget && closeDialog()}
>
  <!-- Telescope Container -->
  <div 
    class="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-[0_32px_64px_rgba(0,0,0,0.9)]"
    onkeydown={handleKeydown}
  >
    <!-- Header/Input Area -->
    <div class="flex items-center gap-4 border-b border-white/5 bg-white/[0.03] px-8 py-5">
      <div class="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[9px] font-black tracking-[0.2em] text-emerald-400">
        {getModeLabel()}
      </div>
      <div class="relative flex-1">
        <Search size={20} class="absolute left-0 top-1/2 -translate-y-1/2 text-white/10" />
        <input
          bind:this={inputElement}
          bind:value={query}
          type="text"
          placeholder="Search everywhere..."
          class="w-full bg-transparent pl-9 text-lg font-light tracking-tight text-white outline-none placeholder:text-white/5"
        />
      </div>
      <div class="flex items-center gap-4">
        {#if isLoading}
            <div class="h-4 w-4 animate-spin rounded-full border border-white/10 border-t-white/40"></div>
        {/if}
        <button 
            onclick={closeDialog}
            class="rounded-full p-2 text-white/20 transition-all hover:bg-white/5 hover:text-white"
        >
            <X size={20} />
        </button>
      </div>
    </div>

    <!-- Content Area: Two Panes -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Left Pane: Results -->
      <div class="flex w-[40%] flex-col border-r border-white/5">
        <div class="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {#if results.length === 0 && !isLoading}
            <div class="flex h-full flex-col items-center justify-center opacity-20">
              <Search size={48} strokeWidth={1} />
              <p class="mt-2 text-xs">No results found</p>
            </div>
          {:else}
            {#each results as item, i}
              {@const fileIcon = getIcon(item.path)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div 
                class="group relative flex cursor-pointer flex-col rounded-lg px-4 py-3 transition-all {selectedIdx === i ? 'bg-emerald-500/10' : 'hover:bg-white/[0.03]'}"
                onclick={() => { selectedIdx = i; confirmSelection(); }}
                onmouseenter={() => { selectedIdx = i; updatePreview(); }}
              >
                {#if selectedIdx === i}
                  <div class="absolute left-0 top-2 h-[calc(100%-16px)] w-1 rounded-full bg-emerald-500"></div>
                {/if}
                
                <div class="flex items-center gap-3">
                  <div class="shrink-0 transition-transform duration-300 {selectedIdx === i ? 'scale-110' : 'group-hover:scale-105'}">
                    {#if fileIcon}
                      <fileIcon.icon size={16} style="color: {fileIcon.color}" />
                    {:else}
                      <File size={16} class="text-white/20" />
                    {/if}
                  </div>
                  <span class="truncate text-[13px] font-medium tracking-tight {selectedIdx === i ? 'text-white' : 'text-white/60 group-hover:text-white/80'}">
                    {item.name}
                  </span>
                </div>
                
                <div class="mt-1.5 flex flex-col gap-1 overflow-hidden">
                  <span class="truncate text-[10px] font-light tracking-wider text-white/20">
                    {item.path.replace($currentProject || '', '').replace(/^[/\\]/, '')}
                  </span>
                  {#if item.is_grep}
                    <div class="truncate border-l border-white/10 pl-2 text-[11px] leading-relaxed text-white/40">
                      {@html highlightText(item.line_content.trim(), query)}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          {/if}
        </div>
        
        <!-- Bottom Info -->
        <div class="flex items-center justify-between border-t border-white/5 bg-white/[0.01] px-6 py-3 text-[9px] uppercase tracking-[0.15em] text-white/20">
          <div class="flex gap-4">
            <span><b class="text-white/40">ENTER</b> SELECT</span>
            <span><b class="text-white/40">ESC</b> CLOSE</span>
          </div>
          <span>{results.length} Matches</span>
        </div>
      </div>

      <!-- Right Pane: Preview -->
      <div class="relative flex-1 bg-[#090909]">
        {#if previewLoading}
          <div class="flex h-full items-center justify-center">
            <div class="h-6 w-6 animate-spin rounded-full border border-emerald-500/10 border-t-emerald-500"></div>
          </div>
        {:else if previewHighlightedHtml}
          <div class="absolute inset-0 flex flex-col overflow-hidden font-mono text-[12px] leading-relaxed">
            <div class="flex items-center gap-2 px-8 py-4 border-b border-white/5 bg-white/[0.01] text-white/20 text-[10px] tracking-[0.1em] uppercase">
              <File size={12} class="opacity-40" />
              <span class="truncate">{results[selectedIdx]?.path.split(/[/\\]/).pop()}</span>
              {#if results[selectedIdx]?.is_grep}
                <span class="ml-auto text-emerald-500/30">L{results[selectedIdx].line_num + 1}</span>
              {/if}
            </div>
            <pre class="flex-1 overflow-auto p-8 whitespace-pre custom-scrollbar selection:bg-emerald-500/20"><code>{@html previewHighlightedHtml}</code></pre>
          </div>
        {:else}
          <div class="flex h-full flex-col items-center justify-center">
            <div class="relative mb-6">
                <Search size={80} strokeWidth={0.5} class="text-white/[0.03]" />
                <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#090909]"></div>
            </div>
            <p class="text-[10px] font-black tracking-[0.4em] text-white/10 uppercase">Select entry to preview</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
  }
</style>
