<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import {
    Download,
    CheckCircle2,
    Cpu,
    Package,
    Wrench,
    X,
    Search,
    Loader2,
    Globe,
  } from "@lucide/svelte";
  import { closeDialog } from "../../stores/dialogStore";

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

<div
  class="fixed inset-0 z-[100] flex items-center justify-center p-12 transition-all duration-300"
  role="button"
  tabindex="0"
  onclick={(e) => e.target === e.currentTarget && closeDialog()}
  onkeydown={(e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      closeDialog();
    }
  }}
>
  <div class="flex h-full w-full max-w-4xl flex-col overflow-hidden border border-white/10 bg-[#0d0d0d] shadow-[0_32px_64px_rgba(0,0,0,0.9)]">

    <!-- Header -->
    <div class="flex items-center justify-between border-b border-white/5 bg-white/[0.03] px-8 py-6">
      <div class="flex items-center gap-4">
        <div class="bg-emerald-500/10 p-2.5 text-emerald-400">
          <Cpu size={24} />
        </div>
        <div>
          <h2 class="text-xl font-medium tracking-tight text-white">Grammar Hub</h2>
          <p class="text-xs tracking-wide text-white/30 uppercase">Tree-sitter Parser Manager — compile from source</p>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <div class="relative w-64">
          <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search languages…"
            class="w-full border border-white/5 bg-white/5 py-2 pl-9 pr-4 text-xs text-white outline-none focus:border-emerald-500/30"
          />
        </div>
        <button
          onclick={closeDialog}
          class="p-2 text-white/20 transition-all hover:bg-white/5 hover:text-white"
        >
          <X size={20} />
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
      {#if isLoading}
        <div class="flex h-full items-center justify-center">
          <Loader2 size={32} class="animate-spin text-emerald-500/20" />
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {#each filteredParsers as parser}
            <div class="group relative flex items-center justify-between border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-white/10 hover:bg-white/[0.04]">
              <!-- Left: icon + name -->
              <div class="flex items-center gap-4">
                <div class="flex h-10 w-10 items-center justify-center bg-black/40 text-white/40 group-hover:text-emerald-400 transition-colors">
                  <Package size={20} />
                </div>
                <div>
                  <h3 class="text-sm font-medium text-white">{parser.language}</h3>
                  <p class="text-[10px] tracking-widest text-white/20 uppercase">{parser.name}</p>
                </div>
              </div>

              <!-- Right: action -->
              <div class="flex flex-col items-end gap-1.5">
                {#if parser.installed}
                  <div class="flex items-center gap-2 text-emerald-400/60">
                    <CheckCircle2 size={16} />
                    <span class="text-[10px] font-bold uppercase tracking-wider">Installed</span>
                  </div>
                  {#if repairing === parser.language}
                    <Loader2 size={12} class="animate-spin text-amber-400" />
                  {:else}
                    <button
                      onclick={() => repairQueries(parser.language)}
                      class="flex items-center gap-1 bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-white/30 transition-all hover:bg-amber-500/20 hover:text-amber-400"
                      title="Re-download highlight queries"
                    >
                      <Wrench size={10} />
                      Fix queries
                    </button>
                  {/if}
                {:else if installing === parser.language}
                  <div class="flex flex-col items-end gap-1 w-32">
                    <div class="flex items-center gap-2">
                      <Loader2 size={14} class="animate-spin text-emerald-500" />
                      <span class="text-[9px] text-emerald-400">{progress[parser.language]?.toFixed(0) ?? 0}%</span>
                    </div>
                    <div class="w-full h-0.5 bg-white/5 overflow-hidden">
                      <div class="h-full bg-emerald-500 transition-all duration-300" style:width="{progress[parser.language] ?? 0}%"></div>
                    </div>
                  </div>
                {:else}
                  <button
                    onclick={() => install(parser.language)}
                    class="flex items-center gap-2 bg-white/5 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white/60 transition-all hover:bg-emerald-500 hover:text-black"
                  >
                    <Download size={14} />
                    Install
                  </button>
                {/if}

                {#if statusMsg[parser.language]}
                  <span class={`max-w-40 text-right text-[9px] ${
                    statusMsg[parser.language].startsWith('Error:')
                      ? 'text-rose-400/80'
                      : 'text-white/35'
                  }`}>
                    {statusMsg[parser.language]}
                  </span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between border-t border-white/5 bg-white/[0.01] px-8 py-4 text-[9px] uppercase tracking-[0.2em] text-white/20">
      <div class="flex items-center gap-2">
        <Globe size={10} class="text-emerald-500/40" />
        <span>Downloads prebuilt binaries automatically — no compiler required</span>
      </div>
      <span>{parsers.filter(p => p.installed).length} / {parsers.length} installed</span>
    </div>
  </div>
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
</style>
