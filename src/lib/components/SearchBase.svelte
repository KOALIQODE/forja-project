<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { Search, X, File } from "@lucide/svelte";
  import { closeDialog } from "../../stores/dialogStore";
  import { activeUITheme } from "../../stores/uiThemeStore";

  interface Props {
    title: string;
    query: string;
    isLoading?: boolean;
    results: any[];
    selectedIdx: number;
    previewLoading?: boolean;
    previewHighlightedHtml?: string;
    previewTitle?: string;
    onQueryChange: (q: string) => void;
    onKeydown: (e: KeyboardEvent) => void;
    resultsList: Snippet<[any[]]>;
  }

  let {
    title,
    query = $bindable(),
    isLoading = false,
    results,
    selectedIdx,
    previewLoading = false,
    previewHighlightedHtml = '',
    previewTitle = '',
    onQueryChange,
    onKeydown,
    resultsList
  }: Props = $props();

  let inputElement = $state<HTMLInputElement | null>(null);

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );

  onMount(() => {
    inputElement?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-[100] flex items-center justify-center p-8"
  onclick={(e) => e.target === e.currentTarget && closeDialog()}
  style={themeStyle}
  data-program-ui
>
  <div
    class="search-shell flex h-full w-full max-w-5xl flex-col overflow-hidden"
    data-dialog-shell
    onkeydown={onKeydown}
  >
    <!-- Header/Input Area -->
    <div class="header-row flex items-center gap-3 px-4 py-2.5">
      <span class="mode-label">{title}</span>
      <div class="sep-v"></div>
      <div class="relative flex flex-1 items-center">
        <Search size={13} style="color: var(--forja-ui-text-secondary, #dedee2); position: absolute; left: 0;" />
        <input
          bind:this={inputElement}
          value={query}
          oninput={(e) => onQueryChange(e.currentTarget.value)}
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
            {@render resultsList(results)}
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
              <span class="truncate">{previewTitle}</span>
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
  .search-shell {
    background: var(--forja-ui-picker-bg, #0e0e11);
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

  .close-btn { color: var(--forja-ui-text-muted, #b4b4c0); }
  .close-btn:hover { color: var(--forja-ui-text-primary, #f4f4f5); }

  .left-pane { border-right: 1px solid var(--forja-ui-btn-border, #27272a); }

  .empty-state {
    color: var(--forja-ui-text-secondary, #dedee2);
    opacity: 0.6;
  }

  .footer-row {
    border-top: 1px solid var(--forja-ui-btn-border, #27272a);
    color: var(--forja-ui-text-muted, #b4b4c0);
  }
  .kbd-hint { color: var(--forja-ui-text-muted, #b4b4c0); }
  .kbd-key { color: var(--forja-ui-text-secondary, #dedee2); font-style: normal; }
  .match-count { color: var(--forja-ui-text-muted, #b4b4c0); }

  .preview-pane { background: var(--forja-ui-explorer-bg, #0a0a0a); }

  .preview-header {
    border-bottom: 1px solid var(--forja-ui-btn-border, #27272a);
    color: var(--forja-ui-text-secondary, #dedee2);
  }

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
