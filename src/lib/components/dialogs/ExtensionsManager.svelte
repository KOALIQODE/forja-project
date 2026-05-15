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
    Package,
    Wrench,
    Globe,
  } from "@lucide/svelte";
  import { closeDialog } from "../../stores/dialogStore";
  import { theme } from "../../stores/uiThemeStore";
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

  // ── Tabs ───────────────────────────────────────────────────────────────────

  interface Props {
    activeTab?: "lsp" | "parsers" | "plugins" | "themes";
  }

  let { activeTab: initialTab = "lsp" }: Props = $props();

  let activeTab = $state<"lsp" | "parsers" | "plugins" | "themes">("lsp");

  $effect(() => {
    activeTab = initialTab;
  });

  // ── LSP State ──────────────────────────────────────────────────────────────

  let servers = $state<LspServer[]>([]);
  let isLoadingLsp = $state(true);
  let installing = $state<string | null>(null);
  let statusMessage = $state<Record<string, string>>({});

  // ── Parser State ───────────────────────────────────────────────────────────

  let parsers = $state<ParserInfo[]>([]);
  let isLoadingParsers = $state(true);
  let installingParser = $state<string | null>(null);
  let repairingParser = $state<string | null>(null);
  let parserProgress = $state<Record<string, number>>({});
  let parserStatusMsg = $state<Record<string, string>>({});

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

  // Core UI themes are always built-in — exclude from the theme manager list
  const CORE_UI_THEMES = new Set(['misto-dark', 'misto-light']);
  // Reactive from stores — use knownPlugins so disabled themes remain visible
  let plugins = $derived($knownPlugins.filter(p => p.kind === "plugin"));
  let themes  = $derived($knownPlugins.filter(p => p.kind === "theme" && !CORE_UI_THEMES.has(p.name)));
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
  let filteredParsers = $derived(
    parsers.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.language.toLowerCase().includes(searchQuery.toLowerCase())
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

  // ── Parser Data ────────────────────────────────────────────────────────────

  async function loadParsers() {
    isLoadingParsers = true;
    try {
      parsers = await invoke<ParserInfo[]>('pm_list_parsers');
    } catch (e) {
      console.error('pm_list_parsers:', e);
    } finally {
      isLoadingParsers = false;
    }
  }

  async function installParser(lang: string) {
    installingParser = lang;
    parserProgress[lang] = 0;
    parserStatusMsg[lang] = 'Compiling from source…';
    try {
      await invoke('pm_download_or_compile_parser', { parserName: lang });
      parserStatusMsg[lang] = 'Installed ✓';
      parserProgress[lang] = 100;
      await loadParsers();
    } catch (e) {
      parserStatusMsg[lang] = `Error: ${formatError(e)}`;
    } finally {
      installingParser = null;
    }
  }

  async function repairQueries(lang: string) {
    repairingParser = lang;
    parserStatusMsg[lang] = 'Repairing queries…';
    try {
      await invoke('repair_parser_queries', { language: lang });
      parserStatusMsg[lang] = 'Queries fixed ✓';
    } catch (e) {
      parserStatusMsg[lang] = `Error: ${formatError(e)}`;
    } finally {
      repairingParser = null;
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

  async function activateTheme(theme: PluginInfo) {
    // Re-enable plugin if it was previously disabled/unloaded
    if (disabled.has(theme.name)) {
      await enablePlugin(theme);
    }
    await activateThemeByName(theme.name);
  }

  async function deactivateTheme(name: string) {
    activeTheme.set(null);
    clearTheme();
    localStorage.setItem("forja:activeTheme", "__none__");
    // Disable the plugin so it disappears from the Ctrl+K+T UI theme picker
    await disablePlugin(name);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onMount(() => {
    loadServers();
    loadParsers();
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

    const unlistenParserProgress = listen<DownloadProgress>('download-progress', (e) => {
      const { parser, percentage, status } = e.payload;
      parserProgress[parser] = percentage;
      parserStatusMsg[parser] = status;
    });

    const unlistenParserReady = listen<string>('parser-ready', (e) => {
      const lang = e.payload;
      parserStatusMsg[lang] = 'Installed ✓';
      parserProgress[lang] = 100;
      loadParsers();
    });

    return () => {
      unlistenStatus.then(f => f());
      unlistenReady.then(f => f());
      unlistenParserProgress.then(f => f());
      unlistenParserReady.then(f => f());
    };
  });
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-[100] flex items-center justify-center p-8"
  onclick={(e) => e.target === e.currentTarget && closeDialog()}
  use:theme
>
  <div
    class="flex h-full max-h-[680px] w-full max-w-4xl flex-col overflow-hidden
           bg-(--color-surface-base)
           border border-(--color-border)"
    onkeydown={(e) => e.key === 'Escape' && closeDialog()}
  >
    <!-- Unified Header -->
    <header class="flex items-center gap-3 px-4 py-2.5 border-b border-(--color-border)">
      <div class="flex w-[172px] shrink-0 items-center">
        <span class="text-(--color-accent) font-bold tracking-[0.18em] uppercase">Extensions</span>
      </div>
      <div class="w-[1px] h-3 bg-(--color-border) shrink-0"></div>

      <div class="relative flex flex-1 items-center px-1">
        <Search size={13} class="absolute left-1 text-(--color-text-secondary)" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search in {activeTab.toUpperCase()}…"
          class="w-full bg-transparent pl-6 outline-none text-(--color-text-primary) placeholder:text-(--color-text-secondary)"
        />
      </div>

      <button onclick={closeDialog} class="flex h-6 w-6 items-center justify-center text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors">
        <X size={14} />
      </button>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar -->
      <aside class="flex w-[200px] shrink-0 flex-col bg-(--color-surface-base) border-r border-(--color-border)">
        <nav class="flex flex-col px-2 py-1.5">
          {#each [
            { id: 'lsp',     label: 'LSP',     icon: Server,  desc: 'Language Servers', count: servers.filter(s => s.installed).length },
            { id: 'parsers', label: 'Grammars', icon: Package, desc: 'Tree-sitter Parsers', count: parsers.filter(p => p.installed).length },
            { id: 'plugins', label: 'Plugins', icon: Puzzle,  desc: 'Lua Plugins',      count: plugins.filter(p => !disabled.has(p.name)).length },
            { id: 'themes',  label: 'Themes',  icon: Palette, desc: 'UI Themes',       count: themes.length },
          ] as tab}
            <button
              type="button"
              onclick={() => activeTab = tab.id as any}
              class="flex items-center gap-2.5 px-2 py-2.5 text-left transition-colors
                     {activeTab === tab.id 
                       ? 'text-(--color-text-primary) bg-(--color-accent-fill)' 
                       : 'text-(--color-text-muted) hover:bg-(--color-hover-bg-subtle)'}"
            >
              <tab.icon size={13} class="shrink-0" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between">
                  <div class="font-bold uppercase tracking-[0.14em]">{tab.label}</div>
                  {#if tab.count > 0}
                    <span class="text-[10px] opacity-60 bg-(--color-hover-bg-subtle) px-1 rounded-sm">{tab.count}</span>
                  {/if}
                </div>
                <div class="mt-0.5 leading-tight opacity-80 text-[11px] truncate">{tab.desc}</div>
              </div>
            </button>
          {/each}
        </nav>
      </aside>

      <!-- Main Panel -->
      <section class="flex min-w-0 flex-1 flex-col">
        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-3 [scrollbar-width:thin] scrollbar-thumb-(--color-scrollbar) hover:scrollbar-thumb-(--color-scrollbar-hover)">
      <!-- ── Plugins Tab ──────────────────────────────────────────────────── -->
      {#if activeTab === "plugins"}
        {#if isPluginsLoading}
          <div class="flex h-[200px] items-center justify-center text-(--color-text-secondary) opacity-50">
            <Loader2 size={20} class="animate-spin" />
          </div>
        {:else if filteredPlugins.length === 0}
          <div class="flex h-[200px] flex-col items-center justify-center gap-2 text-(--color-text-secondary) opacity-50">
            <Puzzle size={24} strokeWidth={1} />
            <p class="uppercase tracking-widest">No plugins loaded</p>
          </div>
        {:else}
          <div class="flex items-center gap-2 px-4 py-2 uppercase tracking-[0.2em] text-(--color-text-muted)">
            <span class="flex-1 h-[1px] bg-(--color-border)"></span>
            Lua Plugins — active at runtime
            <span class="flex-1 h-[1px] bg-(--color-border)"></span>
          </div>
          <div class="flex flex-col">
            {#each filteredPlugins as plugin (plugin.name)}
              {@const isDisabled = disabled.has(plugin.name)}
              <div class="group relative cursor-pointer flex items-start justify-between gap-4 px-4 py-3 rounded-lg transition-colors mt-[6px]
                          {isDisabled ? 'opacity-50' : 'hover:bg-(--color-hover-bg-subtle)'}">
                <div class="flex min-w-0 items-start gap-3">
                  <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-(--color-text-muted) bg-(--color-hover-bg-subtle) border border-(--color-border)">
                    <Puzzle size={14} />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="min-w-0 truncate text-(--color-text-primary)">{plugin.name}</span>
                      <span class="text-(--color-text-muted)">v{plugin.version}</span>
                      {#if isDisabled}
                        <span class="font-bold uppercase tracking-wider px-1.5 py-0.5 text-(--color-text-muted) bg-(--color-hover-bg-subtle) border border-(--color-border)">Disabled</span>
                      {/if}
                    </div>
                    <div class="mt-1 flex flex-wrap gap-1">
                      {#each plugin.permissions as perm}
                        <span class="px-1.5 py-0.5 font-bold uppercase tracking-wider {permissionBadgeClass(perm)}">
                          {perm}
                        </span>
                      {/each}
                    </div>
                    {#if plugin.commands.length > 0}
                      <p class="mt-1 text-(--color-text-muted)">Commands: {plugin.commands.join(', ')}</p>
                    {/if}
                  </div>
                </div>
                <div class="mt-0.5 shrink-0">
                  {#if togglingPlugin === plugin.name}
                    <Loader2 size={13} class="animate-spin text-(--color-text-muted)" />
                  {:else if isDisabled}
                    <button onclick={() => togglePlugin(plugin)} 
                            class="flex items-center gap-1.5 px-3 py-1 font-bold uppercase tracking-widest border transition-colors 
                                   text-(--color-text-muted) bg-(--color-hover-bg-subtle) border-(--color-border)
                                   hover:text-(--color-accent) hover:border-(--color-accent-border) hover:bg-(--color-accent-fill)" 
                            title="Enable plugin">
                      <Power size={11} />
                      Enable
                    </button>
                  {:else}
                    <button onclick={() => togglePlugin(plugin)} 
                            class="flex items-center gap-1.5 px-3 py-1 font-bold uppercase tracking-widest border transition-colors
                                   text-(--color-text-muted) bg-(--color-hover-bg-subtle) border-(--color-border)
                                   hover:text-rose-400 hover:border-rose-400/25 hover:bg-rose-400/10" 
                            title="Disable plugin">
                      <PowerOff size={11} />
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
          <div class="flex h-[200px] items-center justify-center text-(--color-text-secondary) opacity-50">
            <Loader2 size={20} class="animate-spin" />
          </div>
        {:else if filteredThemes.length === 0}
          <div class="flex h-[200px] flex-col items-center justify-center gap-2 text-(--color-text-secondary) opacity-50">
            <Palette size={24} strokeWidth={1} />
            <p class="uppercase tracking-widest">No themes loaded</p>
          </div>
        {:else}
          <div class="flex items-center gap-2 px-4 py-2 uppercase tracking-[0.2em] text-(--color-text-muted)">
            <span class="flex-1 h-[1px] bg-(--color-border)"></span>
            Lua Themes — declarative color palettes
            <span class="flex-1 h-[1px] bg-(--color-border)"></span>
          </div>
          <div class="flex flex-col">
            {#each filteredThemes as theme (theme.name)}
              {@const isActive = currentTheme?.name === theme.name}
              <div class="group relative cursor-pointer flex items-start justify-between gap-4 px-4 py-3 rounded-lg transition-colors mt-[6px]
                          {isActive ? 'bg-(--color-accent-fill)' : 'hover:bg-(--color-hover-bg-subtle)'}">
                <div class="flex min-w-0 items-start gap-3">
                  <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border transition-colors
                              {isActive 
                                ? 'text-(--color-accent) bg-(--color-accent-fill) border-(--color-accent-border)' 
                                : 'text-(--color-text-muted) bg-(--color-hover-bg-subtle) border-(--color-border)'}">
                    <Palette size={14} />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="min-w-0 truncate text-(--color-text-primary)">{theme.name}</span>
                      <span class="text-(--color-text-muted)">v{theme.version}</span>
                      {#if isActive}
                        <span class="flex items-center gap-1 px-1.5 py-0.5 font-bold uppercase tracking-wider text-(--color-accent) bg-(--color-accent-fill) border border-(--color-accent-border)">
                          <Sparkles size={7} />
                          Active
                        </span>
                      {/if}
                    </div>
                    {#if isActive && currentTheme}
                      <div class="mt-1.5 flex flex-wrap gap-1">
                        {#each Object.entries({ bg: currentTheme.colors?.bg, fg: currentTheme.colors?.fg, keyword: currentTheme.syntax?.keyword, string: currentTheme.syntax?.string, comment: currentTheme.syntax?.comment, function: currentTheme.syntax?.function_name }).filter(([,v]) => !!v) as [label, color]}
                          <div class="flex items-center gap-1 px-1.5 py-0.5" style="background: {color}18; border: 1px solid {color}30; color: {color}">
                            <div class="h-1.5 w-1.5" style="background: {color}"></div>
                            <span class="uppercase font-bold">{label}</span>
                          </div>
                        {/each}
                      </div>
                    {:else}
                      <div class="mt-1 flex flex-wrap gap-1">
                        {#each theme.permissions as perm}
                          <span class="px-1.5 py-0.5 font-bold uppercase tracking-wider {permissionBadgeClass(perm)}">
                            {perm}
                          </span>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
                <div class="mt-0.5 shrink-0">
                  {#if isActive}
                    <button onclick={() => deactivateTheme(theme.name)} 
                            class="flex items-center gap-1.5 px-3 py-1 font-bold uppercase tracking-widest border transition-colors
                                   text-(--color-text-muted) bg-(--color-hover-bg-subtle) border-(--color-border)
                                   hover:text-rose-400 hover:border-rose-400/25 hover:bg-rose-400/10">
                      <PowerOff size={11} />
                      Deactivate
                    </button>
                  {:else}
                    <button onclick={() => activateTheme(theme)} 
                            class="flex items-center gap-1.5 px-3 py-1 font-bold uppercase tracking-widest border transition-colors 
                                   text-(--color-text-muted) bg-(--color-hover-bg-subtle) border-(--color-border)
                                   hover:text-(--color-accent) hover:border-(--color-accent-border) hover:bg-(--color-accent-fill)">
                      <Power size={11} />
                      Activate
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}

      <!-- ── LSP Tab ──────────────────────────────────────────────────────── -->
      {:else if activeTab === "lsp"}
        {#if isLoadingLsp}
          <div class="flex h-[200px] items-center justify-center text-(--color-text-secondary) opacity-50">
            <Loader2 size={20} class="animate-spin" />
          </div>
        {:else if filteredServers.length === 0}
          <div class="flex h-[200px] flex-col items-center justify-center gap-2 text-(--color-text-secondary) opacity-50">
            <Server size={24} strokeWidth={1} />
            <p class="uppercase tracking-widest">No servers match</p>
          </div>
        {:else}
          <div class="flex items-center gap-2 px-4 py-2 uppercase tracking-[0.2em] text-(--color-text-muted)">
            <span class="flex-1 h-[1px] bg-(--color-border)"></span>
            Language Servers — install on demand
            <span class="flex-1 h-[1px] bg-(--color-border)"></span>
          </div>
          <div class="flex flex-col">
            {#each filteredServers as server (server.id)}
              {@const badge = methodBadge(server.method)}
              <div class="group relative cursor-pointer flex items-start justify-between gap-4 px-4 py-3 rounded-lg transition-colors mt-[6px] hover:bg-(--color-hover-bg-subtle)">
                <div class="flex min-w-0 items-start gap-3">
                  <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-(--color-text-muted) bg-(--color-hover-bg-subtle) border border-(--color-border)">
                    <Server size={14} />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="min-w-0 truncate text-(--color-text-primary)">{server.name}</span>
                      <span class={`shrink-0 px-1.5 py-0.5 font-bold uppercase tracking-wider ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p class="mt-0.5 uppercase tracking-widest text-(--color-text-muted)">{server.language}</p>
                    <p class="mt-1 leading-relaxed text-(--color-text-secondary)">{server.description}</p>
                    {#if server.version}
                      <p class="mt-0.5 text-(--color-accent) opacity-60">{server.version}</p>
                    {/if}
                  </div>
                </div>
                <div class="mt-0.5 shrink-0">
                  {#if server.installed}
                    <div class="flex items-center gap-1.5 text-(--color-accent) opacity-70">
                      <CheckCircle2 size={13} />
                      <span class="font-bold uppercase tracking-wider">Installed</span>
                    </div>
                  {:else if installing === server.id}
                    <div class="flex flex-col items-end gap-1">
                      <Loader2 size={13} class="animate-spin text-(--color-text-muted)" />
                      <span class="max-w-32 text-right text-(--color-text-muted)">
                        {statusMessage[server.id] || 'Installing…'}
                      </span>
                    </div>
                  {:else if server.method === 'manual'}
                    <div class="flex items-center gap-1.5 text-(--color-text-muted)">
                      <ExternalLink size={12} />
                      <span class="uppercase tracking-wider">Manual</span>
                    </div>
                  {:else}
                    <div class="flex flex-col items-end gap-1">
                      <button onclick={() => install(server.id)} 
                              class="flex items-center gap-1.5 px-3 py-1 font-bold uppercase tracking-widest border transition-colors 
                                     text-(--color-text-muted) bg-(--color-hover-bg-subtle) border-(--color-border)
                                     hover:text-(--color-accent) hover:border-(--color-accent-border) hover:bg-(--color-accent-fill)">
                        <Download size={11} />
                        Install
                      </button>
                      {#if statusMessage[server.id]}
                        <span class="max-w-36 text-right {statusMessage[server.id].startsWith('Error:') ? 'text-rose-400/80' : 'text-(--color-text-muted)'}">
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

      <!-- ── Parsers Tab ──────────────────────────────────────────────────── -->
      {#if activeTab === "parsers"}
        {#if isLoadingParsers}
          <div class="flex h-[200px] items-center justify-center text-(--color-text-secondary) opacity-50">
            <Loader2 size={20} class="animate-spin" />
          </div>
        {:else if filteredParsers.length === 0}
          <div class="flex h-[200px] flex-col items-center justify-center gap-2 text-(--color-text-secondary) opacity-50">
            <Package size={24} strokeWidth={1} />
            <p class="uppercase tracking-widest">No parsers match</p>
          </div>
        {:else}
          <div class="flex items-center gap-2 px-4 py-2 uppercase tracking-[0.2em] text-(--color-text-muted)">
            <span class="flex-1 h-[1px] bg-(--color-border)"></span>
            Tree-sitter Grammars — semantic highlighting
            <span class="flex-1 h-[1px] bg-(--color-border)"></span>
          </div>
          <div class="flex flex-col">
            {#each filteredParsers as parser (parser.language)}
              <div class="group relative cursor-pointer flex items-start justify-between gap-4 px-4 py-3 rounded-lg transition-colors mt-[6px] hover:bg-(--color-hover-bg-subtle)">
                <div class="flex min-w-0 items-start gap-3">
                  <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-(--color-text-muted) bg-(--color-hover-bg-subtle) border border-(--color-border)">
                    <Package size={14} />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="min-w-0 truncate text-(--color-text-primary)">{parser.language}</span>
                      <span class="text-(--color-text-muted) font-mono text-[10px] uppercase tracking-widest">{parser.name}</span>
                    </div>
                    <p class="mt-1 leading-relaxed text-(--color-text-secondary) text-[11px] truncate">{parser.source_url}</p>
                  </div>
                </div>
                <div class="mt-0.5 shrink-0">
                  {#if parser.installed}
                    <div class="flex items-center gap-2">
                      <div class="flex items-center gap-1.5 text-(--color-accent) opacity-70">
                        <CheckCircle2 size={13} />
                        <span class="font-bold uppercase tracking-wider">Installed</span>
                      </div>
                      {#if repairingParser === parser.language}
                        <Loader2 size={13} class="animate-spin text-(--color-text-muted)" />
                      {:else}
                        <button onclick={() => repairQueries(parser.language)} 
                                class="flex items-center gap-1.5 px-2 py-1 font-bold uppercase tracking-widest border transition-colors 
                                       text-(--color-text-muted) bg-(--color-hover-bg-subtle) border-(--color-border)
                                       hover:text-amber-400 hover:border-amber-400/25 hover:bg-amber-400/10" 
                                title="Fix highlighting queries">
                          <Wrench size={11} />
                          Fix
                        </button>
                      {/if}
                    </div>
                  {:else if installingParser === parser.language}
                    <div class="flex flex-col items-end gap-1">
                      <div class="flex items-center gap-2">
                        <Loader2 size={13} class="animate-spin text-(--color-text-muted)" />
                        <span class="text-[10px] text-(--color-text-muted)">{parserProgress[parser.language]?.toFixed(0) ?? 0}%</span>
                      </div>
                      <div class="w-24 h-1 bg-(--color-hover-bg-subtle) overflow-hidden rounded-full">
                        <div class="h-full bg-(--color-accent) transition-all duration-300" style="width: {parserProgress[parser.language] ?? 0}%"></div>
                      </div>
                    </div>
                  {:else}
                    <button onclick={() => installParser(parser.language)} 
                            class="flex items-center gap-1.5 px-3 py-1 font-bold uppercase tracking-widest border transition-colors 
                                   text-(--color-text-muted) bg-(--color-hover-bg-subtle) border-(--color-border)
                                   hover:text-(--color-accent) hover:border-(--color-accent-border) hover:bg-(--color-accent-fill)">
                      <Download size={11} />
                      Install
                    </button>
                  {/if}
                  {#if parserStatusMsg[parser.language]}
                    <p class="mt-1 max-w-32 text-right text-[9px] {parserStatusMsg[parser.language].startsWith('Error:') ? 'text-rose-400/80' : 'text-(--color-text-muted)'}">
                      {parserStatusMsg[parser.language]}
                    </p>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}

    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between px-4 py-1.5 uppercase tracking-[0.12em] border-t border-(--color-border) text-(--color-text-muted)">
      <div class="flex items-center gap-1.5">
        {#if activeTab === "plugins"}
          <Puzzle size={9} /><span>Lua sandbox — isolated VM per plugin</span>
        {:else if activeTab === "themes"}
          <Palette size={9} /><span>Declarative — no code execution</span>
        {:else if activeTab === "parsers"}
          <Globe size={9} /><span>Prebuilt binaries — no local compiler needed</span>
        {:else}
          <AlertCircle size={9} /><span>Manual installs require system tools</span>
        {/if}
      </div>
      <span class="text-[10px] font-bold">
        {#if activeTab === "plugins"}
          {@const ac = plugins.filter(p => !disabled.has(p.name)).length}
          {ac} active · {plugins.length - ac} disabled
        {:else if activeTab === "themes"}
          {themes.length} theme{themes.length !== 1 ? 's' : ''} · {currentTheme ? currentTheme.name : 'none'} active
        {:else if activeTab === "parsers"}
          {parsers.filter(p => p.installed).length} / {parsers.length} grammars installed
        {:else}
          {servers.filter(s => s.installed).length} installed · {servers.length} available
        {/if}
      </span>
    </div>

      </section>
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

