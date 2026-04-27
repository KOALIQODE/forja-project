<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { 
    Download, 
    CheckCircle2, 
    Cpu, 
    Package, 
    X,
    Search,
    Loader2
  } from "@lucide/svelte";
  import { closeDialog } from "../../stores/dialogStore";

  interface Parser {
    name: string;
    language: string;
    installed: boolean;
    size_mb: number;
  }

  let parsers = $state<Parser[]>([]);
  let isLoading = $state(true);
  let installing = $state<string | null>(null);
  let statusMessage = $state<Record<string, string>>({});
  let searchQuery = $state('');

  function formatError(error: unknown) {
    if (error instanceof Error) return error.message;
    return typeof error === 'string' ? error : 'Unknown parser installation error';
  }

  async function loadParsers() {
    isLoading = true;
    try {
      parsers = await invoke('list_parsers');
    } catch (e) {
      console.error(e);
    } finally {
      isLoading = false;
    }
  }

  async function install(lang: string) {
    installing = lang;
    statusMessage[lang] = 'Starting...';
    try {
      await invoke('install_parser', { language: lang });
      statusMessage[lang] = 'Ready';
      await loadParsers();
    } catch (e) {
      statusMessage[lang] = `Error: ${formatError(e)}`;
      console.error(e);
    } finally {
      installing = null;
    }
  }

  let filteredParsers = $derived(
    parsers.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.language.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  onMount(() => {
    loadParsers();

    const unlistenStatus = listen('parser-status', (event: any) => {
      const [lang, msg] = event.payload;
      statusMessage[lang] = msg;
    });

    const unlistenReady = listen('parser-ready', (event: any) => {
      const lang = event.payload;
      statusMessage[lang] = 'Ready';
      loadParsers();
    });

    return () => {
      unlistenStatus.then(f => f());
      unlistenReady.then(f => f());
    };
  });
</script>

<div 
  class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-12 transition-all duration-300"
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
  <div 
    class="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-[0_32px_64px_rgba(0,0,0,0.9)]"
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-white/5 bg-white/[0.03] px-8 py-6">
      <div class="flex items-center gap-4">
        <div class="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-400">
          <Cpu size={24} />
        </div>
        <div>
          <h2 class="text-xl font-medium tracking-tight text-white">Grammar Hub</h2>
          <p class="text-xs tracking-wide text-white/30 uppercase">Tree-sitter Parser Manager</p>
        </div>
      </div>
      
      <div class="flex items-center gap-4">
        <div class="relative w-64">
          <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input 
            type="text" 
            bind:value={searchQuery}
            placeholder="Search languages..."
            class="w-full rounded-full border border-white/5 bg-white/5 py-2 pl-9 pr-4 text-xs text-white outline-none focus:border-emerald-500/30"
          />
        </div>
        <button 
          onclick={closeDialog}
          class="rounded-full p-2 text-white/20 transition-all hover:bg-white/5 hover:text-white"
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
            <div class="group relative flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-white/10 hover:bg-white/[0.04]">
              <div class="flex items-center gap-4">
                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-black/40 text-white/40 group-hover:text-emerald-400 transition-colors">
                  <Package size={20} />
                </div>
                <div>
                  <h3 class="text-sm font-medium text-white">{parser.name}</h3>
                  <p class="text-[10px] tracking-widest text-white/20 uppercase">{parser.language} • {parser.size_mb}MB</p>
                </div>
              </div>

              <div>
                {#if parser.installed}
                  <div class="flex items-center gap-2 text-emerald-400/60">
                    <CheckCircle2 size={16} />
                    <span class="text-[10px] font-bold uppercase tracking-wider">Installed</span>
                  </div>
                {:else if installing === parser.language}
                  <div class="flex flex-col items-end gap-1">
                    <Loader2 size={16} class="animate-spin text-emerald-500" />
                    <span class="text-[9px] text-emerald-500/70">{statusMessage[parser.language] || 'Installing...'}</span>
                  </div>
                {:else}
                  <div class="flex flex-col items-end gap-1">
                    <button 
                      onclick={() => install(parser.language)}
                      class="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white/60 transition-all hover:bg-emerald-500 hover:text-black"
                    >
                      <Download size={14} />
                      Install
                    </button>
                    {#if statusMessage[parser.language]}
                      <span
                        class={`max-w-48 text-right text-[9px] ${
                          statusMessage[parser.language].startsWith('Error:')
                            ? 'text-rose-400/80'
                            : 'text-white/35'
                        }`}
                      >
                        {statusMessage[parser.language]}
                      </span>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between border-t border-white/5 bg-white/[0.01] px-8 py-4 text-[9px] uppercase tracking-[0.2em] text-white/20">
      <div class="flex gap-6">
        <span class="flex items-center gap-2"><div class="h-1.5 w-1.5 rounded-full bg-emerald-500"></div> Native Highlights</span>
        <span class="flex items-center gap-2"><div class="h-1.5 w-1.5 rounded-full bg-emerald-500"></div> official queries</span>
      </div>
      <span>{parsers.filter(p => p.installed).length} Grammars active</span>
    </div>
  </div>
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
  }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
  }
</style>
