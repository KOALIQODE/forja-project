import {
    pluginLoad,
    pluginList,
    pluginUnload,
    pluginGetThemes,
    type PluginInfo,
    type ThemeDefinition,
    type BracketRange,
} from "$lib/utils/pluginClient";
import { applyTheme } from "$lib/utils/themeEngine";

// ── State ─────────────────────────────────────────────────────────────────────

let loadedPlugins = $state<PluginInfo[]>([]);
let activeTheme = $state<ThemeDefinition | null>(null);
let bracketRanges = $state<BracketRange[]>([]);
let isLoading = $state(false);
let lastError = $state<string | null>(null);

// ── Derived ───────────────────────────────────────────────────────────────────

const plugins = $derived(loadedPlugins.filter((p) => p.kind === "plugin"));
const themes = $derived(loadedPlugins.filter((p) => p.kind === "theme"));
const allCommands = $derived(
    loadedPlugins.flatMap((p) =>
        p.commands.map((cmd) => ({ plugin: p.name, command: cmd }))
    )
);

// ── Actions ───────────────────────────────────────────────────────────────────

/** Load a plugin from raw Lua source strings. */
async function loadPlugin(manifestSrc: string, mainSrc: string): Promise<string | null> {
    isLoading = true;
    lastError = null;
    try {
        const name = await pluginLoad(manifestSrc, mainSrc);
        await refresh();
        return name;
    } catch (e) {
        lastError = String(e);
        return null;
    } finally {
        isLoading = false;
    }
}

/** Unload a plugin by name. */
async function unloadPlugin(name: string): Promise<void> {
    await pluginUnload(name);
    await refresh();
    // If the active theme was from this plugin, clear it
    if (activeTheme && activeTheme.name === name) {
        activeTheme = null;
    }
}

/** Refresh the list of loaded plugins from the backend. */
async function refresh(): Promise<void> {
    loadedPlugins = await pluginList();
}

/** Load and apply the first registered theme. */
async function loadActiveTheme(): Promise<void> {
    const allThemes = await pluginGetThemes();
    if (allThemes.length > 0) {
        activeTheme = allThemes[0];
        applyTheme(activeTheme);
    }
}

/** Activate a specific theme by name from already-loaded plugins. */
async function activateTheme(themeName: string): Promise<void> {
    const allThemes = await pluginGetThemes();
    const found = allThemes.find((t) => t.name === themeName);
    if (found) {
        activeTheme = found;
        applyTheme(found);
    }
}

/** Update bracket ranges for the current buffer/language. */
function setBracketRanges(ranges: BracketRange[]): void {
    bracketRanges = ranges;
}

// ── Store export ──────────────────────────────────────────────────────────────

export const pluginStore = {
    // State (read-only via getters)
    get loadedPlugins() { return loadedPlugins; },
    get plugins() { return plugins; },
    get themes() { return themes; },
    get activeTheme() { return activeTheme; },
    get bracketRanges() { return bracketRanges; },
    get allCommands() { return allCommands; },
    get isLoading() { return isLoading; },
    get lastError() { return lastError; },

    // Actions
    loadPlugin,
    unloadPlugin,
    refresh,
    loadActiveTheme,
    activateTheme,
    setBracketRanges,
};
