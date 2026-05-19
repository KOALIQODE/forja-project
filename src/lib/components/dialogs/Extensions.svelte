<script lang="ts">
  import { onMount } from "svelte";
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
  import {
    enabledLspServers,
    toggleLsp,
    isLspEnabled,
  } from "../../stores/lspStore";
  import { currentProject } from "../../stores/projectStore";
  import { clearTheme } from "$lib/utils/shared/themeEngine";
  import {
    pluginUnload,
    pluginLoadFromPath,
    pluginPreflight,
  } from "$lib/utils/shared/pluginClient";
  import type {
    PluginInfo,
    PluginPreflightInfo,
  } from "$lib/utils/shared/pluginClient";
  import PermissionConsentDialog from "./PermissionConsent.svelte";
  import DialogWrapper from "$lib/components/dialogs/core/DialogWrapper.svelte";

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

  let searchQuery = $state("");
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
      console.error("preflight failed:", e);
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
  const CORE_UI_THEMES = new Set(["misto-dark", "misto-light"]);
  // Reactive from stores — use knownPlugins so disabled themes remain visible
  let plugins = $derived($knownPlugins.filter((p) => p.kind === "plugin"));
  let themes = $derived(
    $knownPlugins.filter(
      (p) => p.kind === "theme" && !CORE_UI_THEMES.has(p.name),
    ),
  );
  let currentTheme = $derived($activeTheme);
  let isPluginsLoading = $derived($pluginLoading);
  let disabled = $derived($disabledPluginNames);

  let filteredPlugins = $derived(
    plugins.filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );
  let filteredThemes = $derived(
    themes.filter((t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );
  let filteredServers = $derived(
    servers.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.language.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );
  let filteredParsers = $derived(
    parsers.filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.language.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  // ── Helpers ────────────────────────────────────────────────────────────────

  function methodBadge(method: string): { label: string; cls: string } {
    const map: Record<string, { label: string; cls: string }> = {
      npm: { label: "npm", cls: "bg-emerald-500/10 text-emerald-400" },
      pip: { label: "pip", cls: "bg-blue-500/10 text-blue-400" },
      cargo: { label: "cargo", cls: "bg-amber-500/10 text-amber-400" },
      go: { label: "go", cls: "bg-cyan-500/10 text-cyan-400" },
      rustup: { label: "rustup", cls: "bg-orange-500/10 text-orange-400" },
      manual: { label: "manual", cls: "bg-white/5 text-white/30" },
    };
    return map[method] ?? { label: method, cls: "bg-white/5 text-white/30" };
  }

  function permissionBadgeClass(perm: string): string {
    if (perm.startsWith("buffer")) return "bg-blue-500/10 text-blue-400";
    if (perm.startsWith("events")) return "bg-violet-500/10 text-violet-400";
    if (perm.startsWith("theme")) return "bg-amber-500/10 text-amber-400";
    if (perm.startsWith("workspace")) return "bg-rose-500/10 text-rose-400";
    return "bg-white/5 text-white/30";
  }

  function formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return typeof error === "string" ? error : "Unknown error";
  }

  // ── LSP Data ───────────────────────────────────────────────────────────────

  async function loadServers() {
    isLoadingLsp = true;
    try {
      servers = await invoke("list_lsp_servers");
    } catch (e) {
      console.error("list_lsp_servers:", e);
    } finally {
      isLoadingLsp = false;
    }
  }

  async function install(id: string) {
    installing = id;
    statusMessage[id] = "Starting…";
    try {
      await invoke("install_lsp_server", { id });
      statusMessage[id] = "Installed";
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
      parsers = await invoke<ParserInfo[]>("pm_list_parsers");
    } catch (e) {
      console.error("pm_list_parsers:", e);
    } finally {
      isLoadingParsers = false;
    }
  }

  async function installParser(lang: string) {
    installingParser = lang;
    parserProgress[lang] = 0;
    parserStatusMsg[lang] = "Compiling from source…";
    try {
      await invoke("pm_download_or_compile_parser", { parserName: lang });
      parserStatusMsg[lang] = "Installed ✓";
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
    parserStatusMsg[lang] = "Repairing queries…";
    try {
      await invoke("repair_parser_queries", { language: lang });
      parserStatusMsg[lang] = "Queries fixed ✓";
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
      console.error("toggle plugin:", e);
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
        manifestSrc = await invoke<string>("read_file", { path: manifestPath });
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
      console.error("reload plugin:", e);
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

    const unlistenStatus = listen("lsp-status", (event: any) => {
      const [id, msg] = event.payload;
      statusMessage[id] = msg;
    });

    const unlistenReady = listen("lsp-ready", (event: any) => {
      const id = event.payload;
      statusMessage[id] = "Installed";
      loadServers();
    });

    const unlistenParserProgress = listen<DownloadProgress>(
      "download-progress",
      (e) => {
        const { parser, percentage, status } = e.payload;
        parserProgress[parser] = percentage;
        parserStatusMsg[parser] = status;
      },
    );

    const unlistenParserReady = listen<string>("parser-ready", (e) => {
      const lang = e.payload;
      parserStatusMsg[lang] = "Installed ✓";
      parserProgress[lang] = 100;
      loadParsers();
    });

    return () => {
      unlistenStatus.then((f) => f());
      unlistenReady.then((f) => f());
      unlistenParserProgress.then((f) => f());
      unlistenParserReady.then((f) => f());
    };
  });
</script>

<DialogWrapper onClose={closeDialog} position="center" zIndex={100}>
  <div
    class="flex h-full max-h-[680px] w-full max-w-4xl flex-col overflow-hidden
           bg-(--color-surface-base)
           border border-(--color-border)
           animate-[picker-in_0.15s_cubic-bezier(0.16,1,0.3,1)]"
  >
    <!-- Unified Header -->
    <header
      class="flex items-center gap-3 px-4 py-2.5 border-b border-(--color-border)"
    >
      <div class="flex w-43 shrink-0 items-center">
        <span class="text-(--color-text-primary)">Extensions Manager</span>
      </div>
      <div class="w-px h-3 bg-(--color-border) shrink-0"></div>
      <div class="relative flex flex-1 items-center px-1">
        <Search
          strokeWidth={2.5}
          size="1em"
          class="absolute left-1 text-(--color-text-secondary)"
        />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search {activeTab}…"
          class="w-full bg-transparent pl-6 outline-none text-(--color-text-primary) placeholder:text-(--color-text-secondary)"
        />
      </div>
      <button
        onclick={closeDialog}
        class="flex h-6 w-6 items-center justify-center text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors"
      >
        <X strokeWidth={2.5} size="1.2em" />
      </button>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar -->
      <aside
        class="flex w-50 shrink-0 flex-col bg-(--color-surface-base) border-r border-(--color-border)"
      >
        <nav class="flex flex-col">
          {#each [{ id: "lsp", label: "LSP Servers", icon: Server, desc: "Language Servers", count: servers.filter((s) => s.installed).length }, { id: "parsers", label: "Grammars", icon: Package, desc: "Tree-sitter Parsers", count: parsers.filter((p) => p.installed).length }, { id: "plugins", label: "Lua Plugins", icon: Puzzle, desc: "Runtime Extensions", count: plugins.filter((p) => !disabled.has(p.name)).length }, { id: "themes", label: "UI Themes", icon: Palette, desc: "Color Schemes", count: themes.length }] as tab}
            <button
              type="button"
              onclick={() => (activeTab = tab.id as any)}
              class="flex items-center gap-2.5 px-5 py-3 text-left transition-colors text-(--color-text-primary)
                     {activeTab === tab.id
                ? 'bg-(--color-accent-fill)'
                : 'hover:bg-(--color-hover-bg-subtle)'}"
            >
              <tab.icon strokeWidth={2.5} size="1em" class="shrink-0" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between">
                  <div class="font-bold truncate">{tab.label}</div>
                  {#if tab.count > 0}
                    <span
                      class="text-[10px] opacity-60 bg-(--color-surface-hover) px-1 rounded-sm"
                      >{tab.count}</span
                    >
                  {/if}
                </div>
                <div
                  class="mt-0.5 text-[11px] opacity-80 truncate"
                  >{tab.desc}</div
                >
              </div>
            </button>
          {/each}
        </nav>
      </aside>

      <section class="flex min-w-0 flex-1 flex-col">
        <!-- Content -->
        <div
          class="flex-1 overflow-y-auto [scrollbar-width:thin] scrollbar-thumb-(--color-scrollbar) hover:scrollbar-thumb-(--color-scrollbar-hover)"
        >
          <!-- ── Plugins Tab ──────────────────────────────────────────────────── -->
          {#if activeTab === "plugins"}
            {#if isPluginsLoading}
              <div
                class="flex h-[200px] items-center justify-center text-(--color-text-secondary) opacity-50"
              >
                <Loader2 strokeWidth={2.5} size="1.5em" class="animate-spin" />
              </div>
            {:else if filteredPlugins.length === 0}
              <div
                class="flex flex-col items-center justify-center gap-2 p-12 text-(--color-text-secondary) opacity-50"
              >
                <Puzzle strokeWidth={2.5} size="2.2em" />
                <p>No plugins loaded</p>
              </div>
            {:else}
              <div class="flex flex-col">
                {#each filteredPlugins as plugin (plugin.name)}
                  {@const isDisabled = disabled.has(plugin.name)}
                  <div
                    class="group flex items-start transition-colors border-b border-(--color-border)/30 last:border-0
                          {isDisabled
                      ? 'opacity-50'
                      : 'hover:bg-(--color-accent-fill)'}"
                  >
                    <div class="flex flex-1 items-start gap-3 px-4 py-3">
                      <div
                        class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-(--color-text-primary) bg-(--color-surface-hover) rounded-md border border-(--color-border)"
                      >
                        <Puzzle strokeWidth={2.5} size="1.2em" />
                      </div>
                      <div class="min-w-0 flex-1 flex flex-col gap-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <h5
                            class="min-w-0 truncate text-(--color-text-primary)"
                          >
                            {plugin.name}
                          </h5>
                          <span class="text-[11px] text-(--color-text-muted)"
                            >v{plugin.version}</span
                          >
                        </div>

                        {#if plugin.commands.length > 0}
                          <h6 class="text-(--color-text-secondary) truncate">
                            Commands: {plugin.commands.join(", ")}
                          </h6>
                        {/if}

                        <div class="mt-1 flex flex-wrap gap-1">
                          {#each plugin.permissions as perm}
                            <span
                              class="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded {permissionBadgeClass(
                                perm,
                              )}"
                            >
                              {perm}
                            </span>
                          {/each}
                        </div>
                      </div>
                    </div>

                    <div class="flex shrink-0 items-center gap-2 px-4 py-3">
                      {#if togglingPlugin === plugin.name}
                        <Loader2
                          strokeWidth={2.5}
                          size="1.2em"
                          class="animate-spin text-(--color-text-muted)"
                        />
                      {:else if isDisabled}
                        <button
                          onclick={() => togglePlugin(plugin)}
                          class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase border border-(--color-border) rounded-md transition-colors
                                   text-(--color-text-muted) bg-(--color-surface-hover)
                                   hover:text-(--color-accent) hover:border-(--color-accent) hover:bg-(--color-accent-fill)"
                          title="Enable plugin"
                        >
                          <Power strokeWidth={2.5} size="1.2em" />
                          Enable
                        </button>
                      {:else}
                        <button
                          onclick={() => togglePlugin(plugin)}
                          class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase border border-(--color-border) rounded-md transition-colors
                                   text-(--color-text-muted) bg-(--color-surface-hover)
                                   hover:text-rose-400 hover:border-rose-400/25 hover:bg-rose-400/10"
                          title="Disable plugin"
                        >
                          <PowerOff strokeWidth={2.5} size="1.2em" />
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
              <div
                class="flex h-[200px] items-center justify-center text-(--color-text-secondary) opacity-50"
              >
                <Loader2 strokeWidth={2.5} size="1.5em" class="animate-spin" />
              </div>
            {:else if filteredThemes.length === 0}
              <div
                class="flex flex-col items-center justify-center gap-2 p-12 text-(--color-text-secondary) opacity-50"
              >
                <Palette strokeWidth={2.5} size="2.2em" />
                <p>No themes loaded</p>
              </div>
            {:else}
              <div class="flex flex-col">
                {#each filteredThemes as theme (theme.name)}
                  {@const isActive = currentTheme?.name === theme.name}
                  <div
                    class="group flex items-start transition-colors border-b border-(--color-border)/30 last:border-0
                          {isActive
                      ? 'bg-(--color-accent-fill)'
                      : 'hover:bg-(--color-accent-fill)'}"
                  >
                    <div class="flex flex-1 items-start gap-3 px-4 py-3">
                      <div
                        class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-(--color-border) transition-colors
                              {isActive
                          ? 'text-(--color-accent) bg-(--color-accent-fill) border-(--color-accent-border)'
                          : 'text-(--color-text-primary) bg-(--color-surface-hover) border-(--color-border)'}"
                      >
                        <Palette strokeWidth={2.5} size="1.2em" />
                      </div>
                      <div class="min-w-0 flex-1 flex flex-col gap-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <h5
                            class="min-w-0 truncate text-(--color-text-primary)"
                          >
                            {theme.name}
                          </h5>
                          <span class="text-[11px] text-(--color-text-muted)"
                            >v{theme.version}</span
                          >
                          {#if isActive}
                            <span
                              class="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase text-(--color-accent) bg-(--color-accent-fill) border border-(--color-accent-border) rounded"
                            >
                              <Sparkles strokeWidth={2.5} size="0.8em" />
                              Active
                            </span>
                          {/if}
                        </div>

                        {#if isActive && currentTheme}
                          <div class="mt-1 flex flex-wrap gap-1">
                            {#each Object.entries( { bg: currentTheme.colors?.bg, fg: currentTheme.colors?.fg, keyword: currentTheme.syntax?.keyword, string: currentTheme.syntax?.string }, ).filter(([, v]) => !!v) as [label, color]}
                              <div
                                class="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded"
                                style="background: {color}18; border: 1px solid {color}30; color: {color}"
                              >
                                <div
                                  class="h-1.5 w-1.5 rounded-full"
                                  style="background: {color}"
                                ></div>
                                <span class="uppercase font-bold">{label}</span>
                              </div>
                            {/each}
                          </div>
                        {:else}
                          <h6 class="text-(--color-text-secondary) truncate">
                            Color palette extension
                          </h6>
                        {/if}
                      </div>
                    </div>

                    <div class="flex shrink-0 items-center gap-2 px-4 py-3">
                      {#if isActive}
                        <button
                          onclick={() => deactivateTheme(theme.name)}
                          class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase border border-(--color-border) rounded-md transition-colors
                                   text-(--color-text-muted) bg-(--color-surface-hover)
                                   hover:text-rose-400 hover:border-rose-400/25 hover:bg-rose-400/10"
                        >
                          <PowerOff strokeWidth={2.5} size="1.2em" />
                          Deactivate
                        </button>
                      {:else}
                        <button
                          onclick={() => activateTheme(theme)}
                          class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase border border-(--color-border) rounded-md transition-colors
                                   text-(--color-text-muted) bg-(--color-surface-hover)
                                   hover:text-(--color-accent) hover:border-(--color-accent) hover:bg-(--color-accent-fill)"
                        >
                          <Power strokeWidth={2.5} size="1.2em" />
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
              <div
                class="flex h-[200px] items-center justify-center text-(--color-text-secondary) opacity-50"
              >
                <Loader2 strokeWidth={2.5} size="1.5em" class="animate-spin" />
              </div>
            {:else if filteredServers.length === 0}
              <div
                class="flex flex-col items-center justify-center gap-2 p-12 text-(--color-text-secondary) opacity-50"
              >
                <Server strokeWidth={2.5} size="2.2em" />
                <p>No servers found</p>
              </div>
            {:else}
              <div class="flex flex-col">
                {#each filteredServers as server (server.id)}
                  {@const badge = methodBadge(server.method)}
                  <div
                    class="group flex items-start transition-colors border-b border-(--color-border)/30 last:border-0 hover:bg-(--color-accent-fill)"
                  >
                    <div class="flex flex-1 items-start gap-3 px-4 py-3">
                      <div
                        class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-(--color-text-primary) bg-(--color-surface-hover) rounded-md border border-(--color-border)"
                      >
                        <Server strokeWidth={2.5} size="1.2em" />
                      </div>
                      <div class="min-w-0 flex-1 flex flex-col gap-1">
                        <div class="flex items-center gap-2">
                          <h5
                            class="min-w-0 truncate text-(--color-text-primary)"
                          >
                            {server.name}
                          </h5>
                          <span
                            class={`shrink-0 px-1.5 py-0.5 text-[10px] font-bold uppercase rounded ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <h6 class="text-(--color-accent) font-medium">
                          {server.language}
                        </h6>
                        <p
                          class="text-[11px] leading-relaxed text-(--color-text-secondary) line-clamp-2"
                        >
                          {server.description}
                        </p>
                        {#if server.version}
                          <span class="text-[10px] text-(--color-text-muted)"
                            >{server.version}</span
                          >
                        {/if}
                      </div>
                    </div>

                    <div class="flex shrink-0 items-center gap-2 px-4 py-3">
                      <!-- Project Activation Toggle -->
                      {#if $currentProject}
                        {@const isEnabled = $enabledLspServers[$currentProject!]?.has(server.id)}
                        <button
                          onclick={() => toggleLsp($currentProject!, server.id)}
                          class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase border border-(--color-border) rounded-md transition-colors
                                   {isEnabled
                            ? 'text-(--color-accent) border-(--color-accent) bg-(--color-accent-fill)'
                            : 'text-(--color-text-muted) bg-(--color-surface-hover) hover:text-(--color-text-primary)'}"
                          title="Toggle LSP for project"
                        >
                          <Power strokeWidth={2.5} size="1.2em" />
                          {isEnabled ? "Active" : "Inactive"}
                        </button>
                      {/if}

                      <!-- Installation Status -->
                      {#if server.installed}
                        <div class="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle2 strokeWidth={2.5} size="1.2em" />
                          <span class="text-[11px] font-bold uppercase">Installed</span>
                        </div>
                      {:else if installing === server.id}
                        <div class="flex flex-col items-end gap-1">
                          <Loader2 strokeWidth={2.5} size="1.2em" class="animate-spin text-(--color-text-muted)" />
                          <span class="text-[10px] text-(--color-text-muted)">
                            {statusMessage[server.id] || "Installing…"}
                          </span>
                        </div>
                      {:else if server.method === "manual"}
                        <div class="flex items-center gap-1.5 text-(--color-text-muted)">
                          <ExternalLink strokeWidth={2.5} size="1em" />
                          <span class="text-[11px] font-bold uppercase">Manual</span>
                        </div>
                      {:else}
                        <div class="flex flex-col items-end gap-1">
                          <button
                            onclick={() => install(server.id)}
                            class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase border border-(--color-border) rounded-md transition-colors
                                     text-(--color-text-muted) bg-(--color-surface-hover)
                                     hover:text-(--color-accent) hover:border-(--color-accent) hover:bg-(--color-accent-fill)"
                          >
                            <Download strokeWidth={2.5} size="1.2em" />
                            Install
                          </button>
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
              <div
                class="flex h-[200px] items-center justify-center text-(--color-text-secondary) opacity-50"
              >
                <Loader2 strokeWidth={2.5} size="1.5em" class="animate-spin" />
              </div>
            {:else if filteredParsers.length === 0}
              <div
                class="flex flex-col items-center justify-center gap-2 p-12 text-(--color-text-secondary) opacity-50"
              >
                <Package strokeWidth={2.5} size="2.2em" />
                <p>No parsers found</p>
              </div>
            {:else}
              <div class="flex flex-col">
                {#each filteredParsers as parser (parser.language)}
                  <div
                    class="group flex items-start transition-colors border-b border-(--color-border)/30 last:border-0 hover:bg-(--color-accent-fill)"
                  >
                    <div class="flex flex-1 items-start gap-3 px-4 py-3">
                      <div
                        class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-(--color-text-primary) bg-(--color-surface-hover) rounded-md border border-(--color-border)"
                      >
                        <Package strokeWidth={2.5} size="1.2em" />
                      </div>
                      <div class="min-w-0 flex-1 flex flex-col gap-1">
                        <div class="flex items-center gap-2">
                          <h5
                            class="min-w-0 truncate text-(--color-text-primary)"
                          >
                            {parser.language}
                          </h5>
                          <span
                            class="text-[10px] text-(--color-text-muted) font-mono uppercase"
                            >{parser.name}</span
                          >
                        </div>
                        <p
                          class="text-[11px] truncate text-(--color-text-secondary)"
                        >
                          {parser.source_url}
                        </p>
                      </div>
                    </div>

                    <div class="flex shrink-0 items-center gap-2 px-4 py-3">
                      {#if parser.installed}
                        <div class="flex items-center gap-3">
                          <div
                            class="flex items-center gap-1.5 text-emerald-400"
                          >
                            <CheckCircle2 strokeWidth={2.5} size="1.2em" />
                            <span class="text-[11px] font-bold uppercase"
                              >Installed</span
                            >
                          </div>
                          {#if repairingParser === parser.language}
                            <Loader2
                              strokeWidth={2.5}
                              size="1.2em"
                              class="animate-spin text-(--color-text-muted)"
                            />
                          {:else}
                            <button
                              onclick={() => repairQueries(parser.language)}
                              class="flex h-7 w-7 items-center justify-center text-(--color-text-muted) hover:text-amber-400 hover:bg-amber-400/10 rounded-md transition-colors"
                              title="Repair Queries"
                            >
                              <Wrench strokeWidth={2.5} size="1.2em" />
                            </button>
                          {/if}
                        </div>
                      {:else if installingParser === parser.language}
                        <div class="flex flex-col items-end gap-1">
                          <div class="flex items-center gap-2">
                            <Loader2
                              strokeWidth={2.5}
                              size="1.2em"
                              class="animate-spin text-(--color-text-muted)"
                            />
                            <span class="text-[10px] text-(--color-text-muted)"
                              >{parserProgress[parser.language]?.toFixed(0) ??
                                0}%</span
                            >
                          </div>
                          <div
                            class="w-24 h-1 bg-(--color-surface-hover) overflow-hidden rounded-full"
                          >
                            <div
                              class="h-full bg-(--color-accent) transition-all duration-300"
                              style="width: {parserProgress[parser.language] ??
                                0}%"
                            ></div>
                          </div>
                        </div>
                      {:else}
                        <button
                          onclick={() => installParser(parser.language)}
                          class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase border border-(--color-border) rounded-md transition-colors
                                   text-(--color-text-muted) bg-(--color-surface-hover)
                                   hover:text-(--color-accent) hover:border-(--color-accent) hover:bg-(--color-accent-fill)"
                        >
                          <Download strokeWidth={2.5} size="1.2em" />
                          Install
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </div>

        <!-- Footer -->
        <div
          class="flex items-center justify-between px-4 py-3 border-t border-(--color-border) bg-(--color-surface-base)"
        >
          <div
            class="flex items-center gap-2 text-[11px] text-(--color-text-secondary) font-medium"
          >
            {#if activeTab === "plugins"}
              <Puzzle strokeWidth={2.5} size="1em" /><span
                >Lua sandbox — Isolated per plugin</span
              >
            {:else if activeTab === "themes"}
              <Palette strokeWidth={2.5} size="1em" /><span
                >Declarative color palettes</span
              >
            {:else if activeTab === "parsers"}
              <Globe strokeWidth={2.5} size="1em" /><span
                >Prebuilt Tree-sitter grammars</span
              >
            {:else}
              <AlertCircle strokeWidth={2.5} size="1em" /><span
                >Manual installs require system tools</span
              >
            {/if}
          </div>

          <div
            class="text-[11px] font-bold text-(--color-text-primary) opacity-80"
          >
            {#if activeTab === "plugins"}
              {@const ac = plugins.filter((p) => !disabled.has(p.name)).length}
              {ac} active · {plugins.length - ac} disabled
            {:else if activeTab === "themes"}
              {themes.length} themes · {currentTheme
                ? currentTheme.name
                : "none"} active
            {:else if activeTab === "parsers"}
              {parsers.filter((p) => p.installed).length} / {parsers.length} installed
            {:else}
              {servers.filter((s) => s.installed).length} installed · {servers.length}
              total
            {/if}
          </div>
        </div>
      </section>
    </div>
  </div></DialogWrapper
>

<!-- Permission Consent Dialog — rendered above everything else -->
{#if consentPending}
  <PermissionConsentDialog
    info={consentPending.info}
    onApprove={handleConsentApprove}
    onDeny={handleConsentDeny}
  />
{/if}
