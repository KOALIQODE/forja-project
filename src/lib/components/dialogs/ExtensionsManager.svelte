<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import {
    Puzzle,
    Download,
    CheckCircle2,
    X,
    Search,
    Loader2,
    Server,
    AlertCircle,
    ExternalLink,
  } from "@lucide/svelte";
  import { closeDialog } from "../../stores/dialogStore";

  interface LspServer {
    id: string;
    name: string;
    language: string;
    description: string;
    method: string;
    binary: string;
    installed: boolean;
    version: string | null;
  }

  // ── State ──────────────────────────────────────────────────────────────────

  let servers = $state<LspServer[]>([]);
  let isLoading = $state(true);
  let installing = $state<string | null>(null);
  let statusMessage = $state<Record<string, string>>({});
  let searchQuery = $state('');

  // ── Derived ────────────────────────────────────────────────────────────────

  let filtered = $derived(
    servers.filter(s =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.language.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  let installedCount = $derived(servers.filter(s => s.installed).length);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function methodBadge(method: string): { label: string; cls: string } {
    const map: Record<string, { label: string; cls: string }> = {
      npm:    { label: 'npm',    cls: 'bg-emerald-500/10 text-emerald-400' },
      pip:    { label: 'pip',    cls: 'bg-blue-500/10 text-blue-400' },
      cargo:  { label: 'cargo', cls: 'bg-amber-500/10 text-amber-400' },
      go:     { label: 'go',    cls: 'bg-cyan-500/10 text-cyan-400' },
      rustup: { label: 'rustup', cls: 'bg-orange-500/10 text-orange-400' },
      manual: { label: 'manual', cls: 'bg-white/5 text-white/30' },
    };
    return map[method] ?? { label: method, cls: 'bg-white/5 text-white/30' };
  }

  function formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return typeof error === 'string' ? error : 'Unknown error';
  }

  // ── Data ───────────────────────────────────────────────────────────────────

  async function loadServers() {
    isLoading = true;
    try {
      servers = await invoke('list_lsp_servers');
    } catch (e) {
      console.error('list_lsp_servers:', e);
    } finally {
      isLoading = false;
    }
  }

  async function install(id: string) {
    installing = id;
    statusMessage[id] = 'Starting…';
    try {
      await invoke('install_lsp_server', { id });
      statusMessage[id] = 'Installed';
      await loadServers();
    } catch (e) {
      statusMessage[id] = `Error: ${formatError(e)}`;
      console.error(e);
    } finally {
      installing = null;
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onMount(() => {
    loadServers();

    const unlistenStatus = listen('lsp-status', (event: any) => {
      const [id, msg] = event.payload;
      statusMessage[id] = msg;
    });

    const unlistenReady = listen('lsp-ready', (event: any) => {
      const id = event.payload;
      statusMessage[id] = 'Installed';
      loadServers();
    });

    return () => {
      unlistenStatus.then(f => f());
      unlistenReady.then(f => f());
    };
  });
</script>

<!-- Backdrop -->
<div
  class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-12 backdrop-blur-md"
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
  <!-- Panel -->
  <div class="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-[0_32px_64px_rgba(0,0,0,0.9)]">

    <!-- Header -->
    <div class="flex items-center justify-between border-b border-white/5 bg-white/[0.03] px-8 py-6">
      <div class="flex items-center gap-4">
        <div class="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
          <Puzzle size={24} />
        </div>
        <div>
          <h2 class="text-xl font-medium tracking-tight text-white">Extensions</h2>
          <p class="text-xs uppercase tracking-wide text-white/30">Language Server Manager</p>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <div class="relative w-64">
          <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search languages…"
            class="w-full rounded-full border border-white/5 bg-white/5 py-2 pl-9 pr-4 text-xs text-white outline-none focus:border-violet-500/30"
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
          <Loader2 size={32} class="animate-spin text-violet-500/30" />
        </div>
      {:else if filtered.length === 0}
        <div class="flex h-full flex-col items-center justify-center gap-3 text-white/20">
          <Server size={32} />
          <p class="text-xs uppercase tracking-widest">No servers match your search</p>
        </div>
      {:else}
        <!-- Section label -->
        <p class="mb-4 flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-white/20">
          <span class="h-px flex-1 bg-white/5"></span>
          Language Servers — install on demand
          <span class="h-px flex-1 bg-white/5"></span>
        </p>

        <!-- Grid -->
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          {#each filtered as server (server.id)}
            {@const badge = methodBadge(server.method)}
            <div class="group relative flex items-start justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-white/10 hover:bg-white/[0.04]">

              <!-- Left: icon + info -->
              <div class="flex min-w-0 items-start gap-4">
                <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/40 text-white/30 transition-colors group-hover:text-violet-400">
                  <Server size={20} />
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <h3 class="truncate text-sm font-medium text-white">{server.name}</h3>
                    <span class={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p class="mt-0.5 text-[10px] uppercase tracking-widest text-white/25">{server.language}</p>
                  <p class="mt-1.5 text-[11px] leading-relaxed text-white/40">{server.description}</p>
                  {#if server.version}
                    <p class="mt-1 text-[9px] text-violet-400/50">{server.version}</p>
                  {/if}
                </div>
              </div>

              <!-- Right: status/action -->
              <div class="mt-1 shrink-0">
                {#if server.installed}
                  <div class="flex items-center gap-1.5 text-emerald-400/70">
                    <CheckCircle2 size={15} />
                    <span class="text-[10px] font-bold uppercase tracking-wider">Installed</span>
                  </div>
                {:else if installing === server.id}
                  <div class="flex flex-col items-end gap-1">
                    <Loader2 size={16} class="animate-spin text-violet-500" />
                    <span class="max-w-32 text-right text-[9px] text-violet-400/70">
                      {statusMessage[server.id] || 'Installing…'}
                    </span>
                  </div>
                {:else if server.method === 'manual'}
                  <div class="flex items-center gap-1.5 text-white/20" title="Requires manual installation">
                    <ExternalLink size={14} />
                    <span class="text-[10px] uppercase tracking-wider">Manual</span>
                  </div>
                {:else}
                  <div class="flex flex-col items-end gap-1">
                    <button
                      onclick={() => install(server.id)}
                      class="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white/60 transition-all hover:bg-violet-500 hover:text-white"
                    >
                      <Download size={13} />
                      Install
                    </button>
                    {#if statusMessage[server.id]}
                      <span
                        class={`max-w-36 text-right text-[9px] ${
                          statusMessage[server.id].startsWith('Error:')
                            ? 'text-rose-400/80'
                            : 'text-white/35'
                        }`}
                      >
                        {statusMessage[server.id]}
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
        <span class="flex items-center gap-2">
          <div class="h-1.5 w-1.5 rounded-full bg-violet-500"></div>
          Language Servers
        </span>
        <span class="flex items-center gap-2">
          <AlertCircle size={10} />
          Manual installs require system tools
        </span>
      </div>
      <span>{installedCount} installed · {servers.length} available</span>
    </div>

  </div>
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
</style>
