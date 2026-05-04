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
    Palette,
    Power,
    PowerOff,
    Sparkles,
  } from "@lucide/svelte";
  import { closeDialog } from "../../stores/dialogStore";
  import {
    loadedPlugins,
    knownPlugins,
    disabledPluginNames,
    activeTheme,
    pluginLoading,
    refreshPlugins,
    activateThemeByName,
    unloadPlugin,
    disablePlugin,
    enablePlugin,
  } from "../../stores/pluginStore";
  import { clearTheme } from "../../utils/themeEngine";
  import { pluginUnload, pluginLoadFromPath, pluginPreflight } from "../../utils/pluginClient";
  import type { PluginInfo, PluginPreflightInfo } from "../../utils/pluginClient";
  import PermissionConsentDialog from "./PermissionConsentDialog.svelte";

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

  // ── Tabs ───────────────────────────────────────────────────────────────────

  let activeTab = $state<"lsp" | "plugins" | "themes">("lsp");

  // ── LSP State ──────────────────────────────────────────────────────────────

  let servers = $state<LspServer[]>([]);
  let isLoadingLsp = $state(true);
  let installing = $state<string | null>(null);
  let statusMessage = $state<Record<string, string>>({});

  // ── Plugin/Theme State ─────────────────────────────────────────────────────

  let searchQuery = $state('');
  let togglingPlugin = $state<string | null>(null);

  // ── Permission Consent State ───────────────────────────────────────────────

  let consentPending = $state<{
    info: PluginPreflightInfo;
    resolve: (approved: boolean) => void;
  } | null>(null);

  /**
   * Show the permission consent dialog for the given manifest source.
   * Returns true if the user approved, false if denied.
   * Skips the dialog for built-in plugins (no external install needed).
   */
  async function requestConsent(manifestSrc: string): Promise<boolean> {
    let info: PluginPreflightInfo;
    try {
      info = await pluginPreflight(manifestSrc);
    } catch (e) {
      console.error('preflight failed:', e);
      return false;
    }
    return new Promise<boolean>((resolve) => {
      consentPending = { info, resolve };
    });
  }

  function handleConsentApprove() {
    consentPending?.resolve(true);
    consentPending = null;
  }

  function handleConsentDeny() {
    consentPending?.resolve(false);
    consentPending = null;
  }

  // Reactive from stores
  let plugins = $derived($knownPlugins.filter(p => p.kind === "plugin"));
  let themes  = $derived($loadedPlugins.filter(p => p.kind === "theme"));
  let currentTheme = $derived($activeTheme);
  let isPluginsLoading = $derived($pluginLoading);
  let disabled = $derived($disabledPluginNames);

  let filteredPlugins = $derived(
    plugins.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  let filteredThemes = $derived(
    themes.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  let filteredServers = $derived(
    servers.filter(s =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.language.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

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

  function permissionBadgeClass(perm: string): string {
    if (perm.startsWith('buffer')) return 'bg-blue-500/10 text-blue-400';
    if (perm.startsWith('events')) return 'bg-violet-500/10 text-violet-400';
    if (perm.startsWith('theme'))  return 'bg-amber-500/10 text-amber-400';
    if (perm.startsWith('workspace')) return 'bg-rose-500/10 text-rose-400';
    return 'bg-white/5 text-white/30';
  }

  function formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return typeof error === 'string' ? error : 'Unknown error';
  }

  // ── LSP Data ───────────────────────────────────────────────────────────────

  async function loadServers() {
    isLoadingLsp = true;
    try {
      servers = await invoke('list_lsp_servers');
    } catch (e) {
      console.error('list_lsp_servers:', e);
    } finally {
      isLoadingLsp = false;
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
    } finally {
      installing = null;
    }
  }

  // ── Plugin Actions ─────────────────────────────────────────────────────────

  async function togglePlugin(plugin: PluginInfo) {
    togglingPlugin = plugin.name;
    try {
      if (disabled.has(plugin.name)) {
        await enablePlugin(plugin);
      } else {
        await disablePlugin(plugin.name);
      }
    } catch (e) {
      console.error('toggle plugin:', e);
    } finally {
      togglingPlugin = null;
    }
  }

  async function reloadPlugin(plugin: PluginInfo) {
    if (!plugin.dir_path) return;
    togglingPlugin = plugin.name;
    try {
      // Read the manifest from disk so we can show the consent dialog
      const manifestPath = `${plugin.dir_path}/manifest.lua`;
      let manifestSrc: string | null = null;
      try {
        manifestSrc = await invoke<string>('read_file', { path: manifestPath });
      } catch {
        // If we can't read the manifest, proceed without consent (built-in or stale path)
      }

      if (manifestSrc) {
        const approved = await requestConsent(manifestSrc);
        if (!approved) return;
      }

      await pluginLoadFromPath(plugin.dir_path);
      await refreshPlugins();
    } catch (e) {
      console.error('reload plugin:', e);
    } finally {
      togglingPlugin = null;
    }
  }

  async function activateTheme(name: string) {
    await activateThemeByName(name);
  }

  async function deactivateTheme() {
    activeTheme.set(null);
    clearTheme();
    localStorage.setItem("forja:activeTheme", "__none__");
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onMount(() => {
    loadServers();
    // Ensure plugin store is up to date when modal opens
    refreshPlugins();

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
          <p class="text-xs uppercase tracking-wide text-white/30">Plugins · Themes · Language Servers</p>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <div class="relative w-64">
          <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search…"
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

    <!-- Tabs -->
    <div class="flex gap-1 border-b border-white/5 bg-white/[0.015] px-8 pt-3">
      {#each [
        { id: 'plugins', label: 'Plugins', icon: Puzzle, count: plugins.filter(p => !disabled.has(p.name)).length },
        { id: 'themes',  label: 'Themes',  icon: Palette, count: themes.length },
        { id: 'lsp',     label: 'Language Servers', icon: Server, count: servers.filter(s => s.installed).length },
      ] as tab}
        <button
          onclick={() => activeTab = tab.id as any}
          class="flex items-center gap-2 rounded-t-lg px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all {activeTab === tab.id ? 'border-b-2 border-violet-500 bg-white/5 text-violet-300' : 'text-white/30 hover:text-white/60'}"
        >
          <tab.icon size={13} />
          {tab.label}
          {#if tab.count > 0}
            <span class="rounded-full bg-white/5 px-1.5 py-0.5 text-[9px]">{tab.count}</span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">

      <!-- ── Plugins Tab ──────────────────────────────────────────────────── -->
      {#if activeTab === "plugins"}
        {#if isPluginsLoading}
          <div class="flex h-full items-center justify-center">
            <Loader2 size={32} class="animate-spin text-violet-500/30" />
          </div>
        {:else if filteredPlugins.length === 0}
          <div class="flex h-full flex-col items-center justify-center gap-3 text-white/20">
            <Puzzle size={32} />
            <p class="text-xs uppercase tracking-widest">No plugins loaded</p>
            <p class="text-[10px] text-white/15">Plugins run logic at runtime — bracket colorizers, formatters, etc.</p>
          </div>
        {:else}
          <p class="mb-4 flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-white/20">
            <span class="h-px flex-1 bg-white/5"></span>
            Lua Plugins — active at runtime
            <span class="h-px flex-1 bg-white/5"></span>
          </p>
          <div class="flex flex-col gap-3">
            {#each filteredPlugins as plugin (plugin.name)}
              {@const isDisabled = disabled.has(plugin.name)}
              <div class="group flex items-start justify-between gap-4 rounded-xl border p-5 transition-all {isDisabled ? 'border-white/5 bg-white/[0.01] opacity-60' : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'}">
                <div class="flex min-w-0 items-start gap-4">
                  <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/40 {isDisabled ? 'text-white/20' : 'text-violet-400/50'}">
                    <Puzzle size={20} />
                  </div>
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="text-sm font-medium {isDisabled ? 'text-white/40' : 'text-white'}">{plugin.name}</h3>
                      <span class="text-[9px] text-white/20">v{plugin.version}</span>
                      {#if isDisabled}
                        <span class="rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/25">Disabled</span>
                      {/if}
                    </div>
                    <div class="mt-1.5 flex flex-wrap gap-1">
                      {#each plugin.permissions as perm}
                        <span class="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider {permissionBadgeClass(perm)}">
                          {perm}
                        </span>
                      {/each}
                    </div>
                    {#if plugin.commands.length > 0}
                      <p class="mt-1.5 text-[9px] text-white/20">Commands: {plugin.commands.join(', ')}</p>
                    {/if}
                  </div>
                </div>
                <!-- Enable / Disable toggle -->
                <div class="mt-1 shrink-0">
                  {#if togglingPlugin === plugin.name}
                    <Loader2 size={16} class="animate-spin text-violet-500" />
                  {:else if isDisabled}
                    <button
                      onclick={() => togglePlugin(plugin)}
                      class="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/30 transition-all hover:bg-emerald-500/20 hover:text-emerald-400"
                      title="Enable plugin"
                    >
                      <Power size={12} />
                      Enable
                    </button>
                  {:else}
                    <button
                      onclick={() => togglePlugin(plugin)}
                      class="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/40 transition-all hover:bg-rose-500/20 hover:text-rose-400"
                      title="Disable plugin"
                    >
                      <PowerOff size={12} />
                      Disable
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}

      <!-- ── Themes Tab ───────────────────────────────────────────────────── -->
      {:else if activeTab === "themes"}
        {#if isPluginsLoading}
          <div class="flex h-full items-center justify-center">
            <Loader2 size={32} class="animate-spin text-violet-500/30" />
          </div>
        {:else if filteredThemes.length === 0}
          <div class="flex h-full flex-col items-center justify-center gap-3 text-white/20">
            <Palette size={32} />
            <p class="text-xs uppercase tracking-widest">No themes loaded</p>
            <p class="text-[10px] text-white/15">Themes are declarative Lua files — no code execution.</p>
          </div>
        {:else}
          <p class="mb-4 flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-white/20">
            <span class="h-px flex-1 bg-white/5"></span>
            Lua Themes — declarative color palettes
            <span class="h-px flex-1 bg-white/5"></span>
          </p>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            {#each filteredThemes as theme (theme.name)}
              {@const isActive = currentTheme?.name === theme.name}
              <div class="group relative flex flex-col gap-4 rounded-xl border p-5 transition-all {isActive ? 'border-violet-500/40 bg-violet-500/5' : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'}">

                <!-- Top row -->
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-start gap-3">
                    <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/40 {isActive ? 'text-violet-400' : 'text-white/20'}">
                      <Palette size={20} />
                    </div>
                    <div>
                      <div class="flex items-center gap-2">
                        <h3 class="text-sm font-medium text-white">{theme.name}</h3>
                        {#if isActive}
                          <span class="flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300">
                            <Sparkles size={8} />
                            Active
                          </span>
                        {/if}
                      </div>
                      <p class="mt-0.5 text-[9px] text-white/20">v{theme.version}</p>
                    </div>
                  </div>

                  <!-- Action -->
                  <div class="shrink-0">
                    {#if isActive}
                      <button
                        onclick={deactivateTheme}
                        class="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-violet-300/60 transition-all hover:bg-rose-500/20 hover:text-rose-400"
                      >
                        <PowerOff size={12} />
                        Deactivate
                      </button>
                    {:else}
                      <button
                        onclick={() => activateTheme(theme.name)}
                        class="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/50 transition-all hover:bg-violet-500 hover:text-white"
                      >
                        <Power size={12} />
                        Activate
                      </button>
                    {/if}
                  </div>
                </div>

                <!-- Color swatches from active theme + syntax preview -->
                {#if isActive && currentTheme}
                  <div class="flex flex-wrap gap-1">
                    {#each Object.entries({ bg: currentTheme.colors?.bg, fg: currentTheme.colors?.fg, keyword: currentTheme.syntax?.keyword, string: currentTheme.syntax?.string, comment: currentTheme.syntax?.comment, function: currentTheme.syntax?.function_name }).filter(([,v]) => !!v) as [label, color]}
                      <div class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] text-white/40" style="background: {color}18; border: 1px solid {color}30">
                        <div class="h-2 w-2 rounded-full" style="background: {color}"></div>
                        {label}
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="flex gap-1.5">
                    {#each theme.permissions as perm}
                      <span class="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider {permissionBadgeClass(perm)}">
                        {perm}
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

      <!-- ── LSP Tab ──────────────────────────────────────────────────────── -->
      {:else if activeTab === "lsp"}
        {#if isLoadingLsp}
          <div class="flex h-full items-center justify-center">
            <Loader2 size={32} class="animate-spin text-violet-500/30" />
          </div>
        {:else if filteredServers.length === 0}
          <div class="flex h-full flex-col items-center justify-center gap-3 text-white/20">
            <Server size={32} />
            <p class="text-xs uppercase tracking-widest">No servers match your search</p>
          </div>
        {:else}
          <p class="mb-4 flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-white/20">
            <span class="h-px flex-1 bg-white/5"></span>
            Language Servers — install on demand
            <span class="h-px flex-1 bg-white/5"></span>
          </p>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            {#each filteredServers as server (server.id)}
              {@const badge = methodBadge(server.method)}
              <div class="group relative flex items-start justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-white/10 hover:bg-white/[0.04]">
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
                    <div class="flex items-center gap-1.5 text-white/20">
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
                        <span class={`max-w-36 text-right text-[9px] ${statusMessage[server.id].startsWith('Error:') ? 'text-rose-400/80' : 'text-white/35'}`}>
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
      {/if}

    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between border-t border-white/5 bg-white/[0.01] px-8 py-4 text-[9px] uppercase tracking-[0.2em] text-white/20">
      <div class="flex gap-6">
        {#if activeTab === "plugins"}
          <span class="flex items-center gap-2"><Puzzle size={10} />Lua sandbox — isolated VM per plugin</span>
        {:else if activeTab === "themes"}
          <span class="flex items-center gap-2"><Palette size={10} />Declarative — no code execution</span>
        {:else}
          <span class="flex items-center gap-2"><AlertCircle size={10} />Manual installs require system tools</span>
        {/if}
      </div>
      {#if activeTab === "plugins"}
        {@const activeCount = plugins.filter(p => !disabled.has(p.name)).length}
        <span>{activeCount} active · {plugins.length - activeCount} disabled</span>
      {:else if activeTab === "themes"}
        <span>{themes.length} theme{themes.length !== 1 ? 's' : ''} · {currentTheme ? currentTheme.name : 'none'} active</span>
      {:else}
        <span>{servers.filter(s => s.installed).length} installed · {servers.length} available</span>
      {/if}
    </div>

  </div>
</div>

<!-- Permission Consent Dialog — rendered above everything else -->
{#if consentPending}
  <PermissionConsentDialog
    info={consentPending.info}
    onApprove={handleConsentApprove}
    onDeny={handleConsentDeny}
  />
{/if}

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
</style>
