<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import {
    Download,
    CheckCircle2,
    Package,
    Wrench,
    X,
    Search,
    Globe,
  } from "@lucide/svelte";
  import { closeDialog } from "../../stores/dialogStore";
  import { activeUITheme } from "../../stores/uiThemeStore";

  interface ParserInfo {
    name: string;
    language: string;
    version: string;
    installed: boolean;
    source_url: string;
  }

  interface DownloadProgress {
    parser: string;
    downloaded: number;
    total: number;
    percentage: number;
    status: string;
  }

  let parsers = $state<ParserInfo[]>([]);
  let isLoading = $state(true);
  let installing = $state<string | null>(null);
  let repairing  = $state<string | null>(null);
  let progress   = $state<Record<string, number>>({});
  let statusMsg  = $state<Record<string, string>>({});
  let searchQuery = $state('');

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );

  let filteredParsers = $derived(
    parsers.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.language.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  function formatError(error: unknown) {
    if (error instanceof Error) return error.message;
    return typeof error === 'string' ? error : 'Unknown error';
  }

  async function loadParsers() {
    isLoading = true;
    try {
      parsers = await invoke<ParserInfo[]>('pm_list_parsers');
    } catch (e) {
      console.error('pm_list_parsers failed:', e);
    } finally {
      isLoading = false;
    }
  }

  async function install(lang: string) {
    installing = lang;
    progress[lang] = 0;
    statusMsg[lang] = 'Compiling from source…';
    try {
      await invoke('pm_download_or_compile_parser', { parserName: lang });
      statusMsg[lang] = 'Installed ✓';
      progress[lang] = 100;
      await loadParsers();
    } catch (e) {
      statusMsg[lang] = `Error: ${formatError(e)}`;
    } finally {
      installing = null;
    }
  }

  async function repairQueries(lang: string) {
    repairing = lang;
    statusMsg[lang] = 'Repairing queries…';
    try {
      await invoke('repair_parser_queries', { language: lang });
      statusMsg[lang] = 'Queries fixed ✓';
    } catch (e) {
      statusMsg[lang] = `Error: ${formatError(e)}`;
    } finally {
      repairing = null;
    }
  }

  onMount(() => {
    loadParsers();

    const unsubs = [
      listen<DownloadProgress>('download-progress', (e) => {
        const { parser, percentage, status } = e.payload;
        progress[parser] = percentage;
        statusMsg[parser] = status;
      }),
      listen<string>('parser-ready', (e) => {
        const lang = e.payload;
        statusMsg[lang] = 'Installed ✓';
        progress[lang] = 100;
        loadParsers();
      }),
      listen<string>('parser-queries-repaired', (e) => {
        statusMsg[e.payload] = 'Queries fixed ✓';
      }),
    ];

    return () => { unsubs.forEach(p => p.then(f => f())); };
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
    class="grammar-shell flex h-full w-full max-w-4xl flex-col overflow-hidden"
    onkeydown={(e) => e.key === 'Escape' && closeDialog()}
  >
    <!-- Header -->
    <div class="header-row flex items-center gap-3 px-4 py-2.5">
      <span class="mode-label">GRAMMAR HUB</span>
      <div class="sep-v"></div>
      <div class="relative flex flex-1 items-center">
        <Search size={13} style="color: var(--forja-ui-text-secondary, #dedee2); position: absolute; left: 0;" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search languages…"
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

    <!-- Content -->
    <div class="custom-scrollbar flex-1 overflow-y-auto">
      {#if isLoading}
        <div class="empty-state flex h-full items-center justify-center">
          <div class="loader"></div>
        </div>
      {:else if filteredParsers.length === 0}
        <div class="empty-state flex h-full flex-col items-center justify-center gap-2">
          <Package size={24} strokeWidth={1} />
          <p class="text-[10px] uppercase tracking-widest">No parsers match</p>
        </div>
      {:else}
        <div class="section-label flex items-center gap-2 px-4 py-2 text-[9px] uppercase tracking-[0.2em]">
          <span class="divider-line flex-1"></span>
          Tree-sitter parsers — compile from source
          <span class="divider-line flex-1"></span>
        </div>
        {#each filteredParsers as parser}
          <div class="item-row flex items-center justify-between gap-4 px-4 py-2.5">
            <!-- Left -->
            <div class="flex items-center gap-3 min-w-0">
              <div class="item-icon flex h-7 w-7 shrink-0 items-center justify-center">
                <Package size={14} />
              </div>
              <div class="min-w-0">
                <span class="item-name text-[12px]">{parser.language}</span>
                <span class="item-meta ml-2 font-mono text-[10px] uppercase tracking-widest">{parser.name}</span>
              </div>
            </div>

            <!-- Right: action -->
            <div class="flex shrink-0 flex-col items-end gap-1">
              {#if parser.installed}
                <div class="flex items-center gap-2">
                  <div class="installed-badge flex items-center gap-1.5">
                    <CheckCircle2 size={13} />
                    <span class="text-[9px] font-bold uppercase tracking-wider">Installed</span>
                  </div>
                  {#if repairing === parser.language}
                    <div class="loader"></div>
                  {:else}
                    <button
                      onclick={() => repairQueries(parser.language)}
                      class="action-btn action-btn--repair flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-widest"
                      title="Re-download highlight queries"
                    >
                      <Wrench size={10} />
                      Fix queries
                    </button>
                  {/if}
                </div>
              {:else if installing === parser.language}
                <div class="flex w-32 flex-col items-end gap-1">
                  <div class="flex items-center gap-2">
                    <div class="loader"></div>
                    <span class="item-meta text-[9px]">{progress[parser.language]?.toFixed(0) ?? 0}%</span>
                  </div>
                  <div class="progress-track w-full">
                    <div class="progress-fill" style:width="{progress[parser.language] ?? 0}%"></div>
                  </div>
                </div>
              {:else}
                <button
                  onclick={() => install(parser.language)}
                  class="action-btn action-btn--install flex items-center gap-1.5 px-3 py-1 text-[9px] font-bold uppercase tracking-widest"
                >
                  <Download size={11} />
                  Install
                </button>
              {/if}

              {#if statusMsg[parser.language]}
                <span class="max-w-40 text-right text-[9px] {statusMsg[parser.language].startsWith('Error:') ? 'text-rose-400/80' : 'item-meta'}">
                  {statusMsg[parser.language]}
                </span>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Footer -->
    <div class="footer-row flex items-center justify-between px-4 py-1.5 text-[9px] uppercase tracking-[0.12em]">
      <div class="flex items-center gap-1.5">
        <Globe size={9} />
        <span>Downloads prebuilt binaries — no compiler required</span>
      </div>
      <span class="match-count">{parsers.filter(p => p.installed).length} / {parsers.length} installed</span>
    </div>

  </div>
</div>

<style>
  .grammar-shell {
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
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .close-btn { color: var(--forja-ui-text-muted, #b4b4c0); }
  .close-btn:hover { color: var(--forja-ui-text-primary, #f4f4f5); }

  .section-label {
    color: var(--forja-ui-text-muted, #b4b4c0);
    border-bottom: 1px solid var(--forja-ui-btn-border, #27272a);
  }
  .divider-line {
    height: 1px;
    background: var(--forja-ui-btn-border, #27272a);
    display: block;
  }

  .item-row {
    border-bottom: 1px solid var(--forja-ui-btn-border, #27272a);
  }
  .item-row:hover { background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03)); }

  .item-icon {
    color: var(--forja-ui-text-muted, #b4b4c0);
    background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03));
    border: 1px solid var(--forja-ui-btn-border, #27272a);
  }

  .item-name { color: var(--forja-ui-text-primary, #f4f4f5); }
  .item-meta { color: var(--forja-ui-text-muted, #b4b4c0); }

  .installed-badge { color: var(--forja-ui-gradient-from, #34d399); opacity: 0.7; }

  .action-btn {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--forja-ui-text-muted, #b4b4c0);
    background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03));
    border: 1px solid var(--forja-ui-btn-border, #27272a);
    transition: color 0.1s, background 0.1s, border-color 0.1s;
  }
  .action-btn--install:hover {
    color: var(--forja-ui-gradient-from, #34d399);
    border-color: rgba(52,211,153,0.30);
    background: rgba(52,211,153,0.08);
  }
  .action-btn--repair:hover {
    color: #fbbf24;
    border-color: rgba(251,191,36,0.25);
    background: rgba(251,191,36,0.06);
  }

  .progress-track {
    height: 2px;
    background: var(--forja-ui-btn-border, #27272a);
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--forja-ui-gradient-from, #34d399);
    transition: width 0.3s;
  }

  .empty-state {
    color: var(--forja-ui-text-secondary, #dedee2);
    opacity: 0.5;
    min-height: 200px;
  }

  .footer-row {
    border-top: 1px solid var(--forja-ui-btn-border, #27272a);
    color: var(--forja-ui-text-muted, #b4b4c0);
  }
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
