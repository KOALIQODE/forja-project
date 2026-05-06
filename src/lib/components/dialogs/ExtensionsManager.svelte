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
  import { activeUITheme } from "../../stores/uiThemeStore";
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

  let themeStyle = $derived(
    Object.entries($activeUITheme.vars).map(([k, v]) => `${k}:${v}`).join(';')
  );

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
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-[100] flex items-center justify-center p-8"
  onclick={(e) => e.target === e.currentTarget && closeDialog()}
  style={themeStyle}
  data-program-ui
>
  <div
    class="ext-shell flex h-full w-full max-w-4xl flex-col overflow-hidden"
    onkeydown={(e) => e.key === 'Escape' && closeDialog()}
  >
    <!-- Header -->
    <div class="header-row flex items-center gap-3 px-4 py-2.5">
      <span class="mode-label">EXTENSIONS</span>
      <div class="sep-v"></div>
      <div class="relative flex flex-1 items-center">
        <Search size={13} style="color: var(--forja-ui-text-secondary, #dedee2); position: absolute; left: 0;" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search…"
          class="search-input w-full bg-transparent pl-5 text-[13px] outline-none"
        />
      </div>
      <button onclick={closeDialog} class="close-btn flex h-6 w-6 items-center justify-center">
        <X size={14} />
      </button>
    </div>

    <!-- Tabs -->
    <div class="tabs-row flex">
      {#each [
        { id: 'lsp',     label: 'LSP',     icon: Server,  count: servers.filter(s => s.installed).length },
        { id: 'plugins', label: 'Plugins', icon: Puzzle,  count: plugins.filter(p => !disabled.has(p.name)).length },
        { id: 'themes',  label: 'Themes',  icon: Palette, count: themes.length },
      ] as tab}
        <button
          onclick={() => activeTab = tab.id as any}
          class="tab-btn flex items-center gap-1.5 px-4 py-2"
          class:tab-btn--active={activeTab === tab.id}
        >
          <tab.icon size={11} />
          <span>{tab.label}</span>
          {#if tab.count > 0}
            <span class="tab-count">{tab.count}</span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- Content -->
    <div class="content-area flex-1 overflow-y-auto custom-scrollbar">

      <!-- ── Plugins Tab ──────────────────────────────────────────────────── -->
      {#if activeTab === "plugins"}
        {#if isPluginsLoading}
          <div class="empty-state flex h-full items-center justify-center">
            <Loader2 size={20} class="animate-spin" />
          </div>
        {:else if filteredPlugins.length === 0}
          <div class="empty-state flex h-full flex-col items-center justify-center gap-2">
            <Puzzle size={24} strokeWidth={1} />
            <p class="text-[10px] uppercase tracking-widest">No plugins loaded</p>
          </div>
        {:else}
          <div class="section-label flex items-center gap-2 px-4 py-2 text-[9px] uppercase tracking-[0.2em]">
            <span class="divider-line flex-1"></span>
            Lua Plugins — active at runtime
            <span class="divider-line flex-1"></span>
          </div>
          <div class="flex flex-col">
            {#each filteredPlugins as plugin (plugin.name)}
              {@const isDisabled = disabled.has(plugin.name)}
              <div class="item-row flex items-start justify-between gap-4 px-4 py-3" class:item-row--disabled={isDisabled}>
                <div class="flex min-w-0 items-start gap-3">
                  <div class="item-icon mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
                    <Puzzle size={14} />
                  </div>
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="item-name text-[12px]">{plugin.name}</span>
                      <span class="item-meta text-[9px]">v{plugin.version}</span>
                      {#if isDisabled}
                        <span class="badge-disabled text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5">Disabled</span>
                      {/if}
                    </div>
                    <div class="mt-1 flex flex-wrap gap-1">
                      {#each plugin.permissions as perm}
                        <span class="perm-badge px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider {permissionBadgeClass(perm)}">
                          {perm}
                        </span>
                      {/each}
                    </div>
                    {#if plugin.commands.length > 0}
                      <p class="item-meta mt-1 text-[9px]">Commands: {plugin.commands.join(', ')}</p>
                    {/if}
                  </div>
                </div>
                <div class="mt-0.5 shrink-0">
                  {#if togglingPlugin === plugin.name}
                    <Loader2 size={13} class="animate-spin item-meta" />
                  {:else if isDisabled}
                    <button onclick={() => togglePlugin(plugin)} class="action-btn action-btn--enable flex items-center gap-1.5 px-3 py-1" title="Enable plugin">
                      <Power size={11} />
                      Enable
                    </button>
                  {:else}
                    <button onclick={() => togglePlugin(plugin)} class="action-btn action-btn--disable flex items-center gap-1.5 px-3 py-1" title="Disable plugin">
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
          <div class="empty-state flex h-full items-center justify-center">
            <Loader2 size={20} class="animate-spin" />
          </div>
        {:else if filteredThemes.length === 0}
          <div class="empty-state flex h-full flex-col items-center justify-center gap-2">
            <Palette size={24} strokeWidth={1} />
            <p class="text-[10px] uppercase tracking-widest">No themes loaded</p>
          </div>
        {:else}
          <div class="section-label flex items-center gap-2 px-4 py-2 text-[9px] uppercase tracking-[0.2em]">
            <span class="divider-line flex-1"></span>
            Lua Themes — declarative color palettes
            <span class="divider-line flex-1"></span>
          </div>
          <div class="flex flex-col">
            {#each filteredThemes as theme (theme.name)}
              {@const isActive = currentTheme?.name === theme.name}
              <div class="item-row flex items-start justify-between gap-4 px-4 py-3" class:item-row--active={isActive}>
                <div class="flex min-w-0 items-start gap-3">
                  <div class="item-icon mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center" class:item-icon--active={isActive}>
                    <Palette size={14} />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="item-name text-[12px]">{theme.name}</span>
                      <span class="item-meta text-[9px]">v{theme.version}</span>
                      {#if isActive}
                        <span class="badge-active flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                          <Sparkles size={7} />
                          Active
                        </span>
                      {/if}
                    </div>
                    {#if isActive && currentTheme}
                      <div class="mt-1.5 flex flex-wrap gap-1">
                        {#each Object.entries({ bg: currentTheme.colors?.bg, fg: currentTheme.colors?.fg, keyword: currentTheme.syntax?.keyword, string: currentTheme.syntax?.string, comment: currentTheme.syntax?.comment, function: currentTheme.syntax?.function_name }).filter(([,v]) => !!v) as [label, color]}
                          <div class="swatch flex items-center gap-1 px-1.5 py-0.5 text-[8px]" style="background: {color}18; border: 1px solid {color}30; color: {color}">
                            <div class="h-1.5 w-1.5" style="background: {color}"></div>
                            {label}
                          </div>
                        {/each}
                      </div>
                    {:else}
                      <div class="mt-1 flex flex-wrap gap-1">
                        {#each theme.permissions as perm}
                          <span class="perm-badge px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider {permissionBadgeClass(perm)}">
                            {perm}
                          </span>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
                <div class="mt-0.5 shrink-0">
                  {#if isActive}
                    <button onclick={() => deactivateTheme(theme.name)} class="action-btn action-btn--disable flex items-center gap-1.5 px-3 py-1">
                      <PowerOff size={11} />
                      Deactivate
                    </button>
                  {:else}
                    <button onclick={() => activateTheme(theme)} class="action-btn action-btn--enable flex items-center gap-1.5 px-3 py-1">
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
          <div class="empty-state flex h-full items-center justify-center">
            <Loader2 size={20} class="animate-spin" />
          </div>
        {:else if filteredServers.length === 0}
          <div class="empty-state flex h-full flex-col items-center justify-center gap-2">
            <Server size={24} strokeWidth={1} />
            <p class="text-[10px] uppercase tracking-widest">No servers match</p>
          </div>
        {:else}
          <div class="section-label flex items-center gap-2 px-4 py-2 text-[9px] uppercase tracking-[0.2em]">
            <span class="divider-line flex-1"></span>
            Language Servers — install on demand
            <span class="divider-line flex-1"></span>
          </div>
          <div class="flex flex-col">
            {#each filteredServers as server (server.id)}
              {@const badge = methodBadge(server.method)}
              <div class="item-row flex items-start justify-between gap-4 px-4 py-3">
                <div class="flex min-w-0 items-start gap-3">
                  <div class="item-icon mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
                    <Server size={14} />
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="item-name truncate text-[12px]">{server.name}</span>
                      <span class={`method-badge shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p class="item-lang mt-0.5 text-[10px] uppercase tracking-widest">{server.language}</p>
                    <p class="item-desc mt-1 text-[11px] leading-relaxed">{server.description}</p>
                    {#if server.version}
                      <p class="item-version mt-0.5 text-[9px]">{server.version}</p>
                    {/if}
                  </div>
                </div>
                <div class="mt-0.5 shrink-0">
                  {#if server.installed}
                    <div class="installed-badge flex items-center gap-1.5">
                      <CheckCircle2 size={13} />
                      <span class="text-[9px] font-bold uppercase tracking-wider">Installed</span>
                    </div>
                  {:else if installing === server.id}
                    <div class="flex flex-col items-end gap-1">
                      <Loader2 size={13} class="animate-spin item-meta" />
                      <span class="item-meta max-w-32 text-right text-[9px]">
                        {statusMessage[server.id] || 'Installing…'}
                      </span>
                    </div>
                  {:else if server.method === 'manual'}
                    <div class="manual-badge flex items-center gap-1.5">
                      <ExternalLink size={12} />
                      <span class="text-[9px] uppercase tracking-wider">Manual</span>
                    </div>
                  {:else}
                    <div class="flex flex-col items-end gap-1">
                      <button onclick={() => install(server.id)} class="action-btn action-btn--install flex items-center gap-1.5 px-3 py-1">
                        <Download size={11} />
                        Install
                      </button>
                      {#if statusMessage[server.id]}
                        <span class="max-w-36 text-right text-[9px] {statusMessage[server.id].startsWith('Error:') ? 'text-rose-400/80' : 'item-meta'}">
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
    <div class="footer-row flex items-center justify-between px-4 py-1.5 text-[9px] uppercase tracking-[0.12em]">
      <div class="flex items-center gap-1.5">
        {#if activeTab === "plugins"}
          <Puzzle size={9} /><span>Lua sandbox — isolated VM per plugin</span>
        {:else if activeTab === "themes"}
          <Palette size={9} /><span>Declarative — no code execution</span>
        {:else}
          <AlertCircle size={9} /><span>Manual installs require system tools</span>
        {/if}
      </div>
      <span class="match-count">
        {#if activeTab === "plugins"}
          {@const ac = plugins.filter(p => !disabled.has(p.name)).length}
          {ac} active · {plugins.length - ac} disabled
        {:else if activeTab === "themes"}
          {themes.length} theme{themes.length !== 1 ? 's' : ''} · {currentTheme ? currentTheme.name : 'none'} active
        {:else}
          {servers.filter(s => s.installed).length} installed · {servers.length} available
        {/if}
      </span>
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
  .ext-shell {
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

  .close-btn { color: var(--forja-ui-text-muted, #b4b4c0); }
  .close-btn:hover { color: var(--forja-ui-text-primary, #f4f4f5); }

  /* Tabs */
  .tabs-row {
    border-bottom: 1px solid var(--forja-ui-btn-border, #27272a);
  }
  .tab-btn {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--forja-ui-text-muted, #b4b4c0);
    border-bottom: 1px solid transparent;
    margin-bottom: -1px;
    transition: color 0.1s;
  }
  .tab-btn:hover { color: var(--forja-ui-text-secondary, #dedee2); }
  .tab-btn--active {
    color: var(--forja-ui-gradient-from, #34d399);
    border-bottom-color: var(--forja-ui-gradient-from, #34d399);
  }
  .tab-count {
    font-size: 9px;
    color: var(--forja-ui-text-muted, #b4b4c0);
    background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03));
    padding: 0 4px;
  }

  /* Content */
  .content-area { }

  .section-label {
    color: var(--forja-ui-text-muted, #b4b4c0);
  }
  .divider-line {
    height: 1px;
    background: var(--forja-ui-btn-border, #27272a);
    display: block;
  }

  /* Items */
  .item-row {
    border-bottom: 1px solid var(--forja-ui-btn-border, #27272a);
  }
  .item-row:hover { background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03)); }
  .item-row--active { background: var(--forja-ui-picker-active, rgba(52,211,153,0.08)); }
  .item-row--disabled { opacity: 0.5; }

  .item-icon {
    color: var(--forja-ui-text-muted, #b4b4c0);
    background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03));
    border: 1px solid var(--forja-ui-btn-border, #27272a);
  }
  .item-icon--active { color: var(--forja-ui-gradient-from, #34d399); }

  .item-name { color: var(--forja-ui-text-primary, #f4f4f5); }
  .item-meta { color: var(--forja-ui-text-muted, #b4b4c0); }
  .item-lang { color: var(--forja-ui-text-muted, #b4b4c0); }
  .item-desc { color: var(--forja-ui-text-secondary, #dedee2); }
  .item-version { color: var(--forja-ui-gradient-from, #34d399); opacity: 0.6; }

  /* Badges */
  .badge-disabled {
    color: var(--forja-ui-text-muted, #b4b4c0);
    background: var(--forja-ui-btn-hover-bg, rgba(255,255,255,0.03));
    border: 1px solid var(--forja-ui-btn-border, #27272a);
  }
  .badge-active {
    color: var(--forja-ui-gradient-from, #34d399);
    background: rgba(52,211,153,0.10);
    border: 1px solid rgba(52,211,153,0.20);
  }
  .perm-badge { }
  .method-badge { }
  .installed-badge { color: var(--forja-ui-gradient-from, #34d399); opacity: 0.7; }
  .manual-badge { color: var(--forja-ui-text-muted, #b4b4c0); }

  /* Action buttons */
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
  .action-btn--enable:hover {
    color: var(--forja-ui-gradient-from, #34d399);
    border-color: rgba(52,211,153,0.30);
    background: rgba(52,211,153,0.08);
  }
  .action-btn--disable:hover {
    color: #f87171;
    border-color: rgba(248,113,113,0.25);
    background: rgba(248,113,113,0.06);
  }
  .action-btn--install:hover {
    color: var(--forja-ui-gradient-from, #34d399);
    border-color: rgba(52,211,153,0.30);
    background: rgba(52,211,153,0.08);
  }

  /* Empty state */
  .empty-state {
    color: var(--forja-ui-text-secondary, #dedee2);
    opacity: 0.5;
    min-height: 200px;
  }

  /* Footer */
  .footer-row {
    border-top: 1px solid var(--forja-ui-btn-border, #27272a);
    color: var(--forja-ui-text-muted, #b4b4c0);
  }
  .match-count { color: var(--forja-ui-text-muted, #b4b4c0); }

  /* Scrollbar */
  .custom-scrollbar::-webkit-scrollbar { width: 3px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--forja-ui-explorer-scrollbar, #1e1e1e);
  }
  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background: var(--forja-ui-explorer-scrollbar-hover, #2e2e2e);
  }
</style>
