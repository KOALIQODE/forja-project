import { writable, derived, get } from "svelte/store";
import {
    pluginLoadBuiltins,
    pluginLoad,
    pluginList,
    pluginUnload,
    pluginGetThemes,
    pluginScanUserPlugins,
    type PluginInfo,
    type ThemeDefinition,
    type BracketRange,
} from "$lib/utils/pluginClient";
import { applyTheme } from "$lib/utils/themeEngine";

// ── Core writable stores ──────────────────────────────────────────────────────

export const loadedPlugins = writable<PluginInfo[]>([]);
export const activeTheme   = writable<ThemeDefinition | null>(null);
export const bracketRanges = writable<BracketRange[]>([]);
export const pluginLoading = writable(false);
export const pluginError   = writable<string | null>(null);

// ── Derived stores ────────────────────────────────────────────────────────────

export const pluginList$  = derived(loadedPlugins, ($p) => $p.filter((p) => p.kind === "plugin"));
export const themeList$   = derived(loadedPlugins, ($p) => $p.filter((p) => p.kind === "theme"));
export const allCommands$ = derived(loadedPlugins, ($p) =>
    $p.flatMap((p) => p.commands.map((cmd) => ({ plugin: p.name, command: cmd })))
);

// ── Actions ───────────────────────────────────────────────────────────────────

/** Initialize built-in plugins then scan user plugin directory. */
export async function initPlugins(): Promise<void> {
    pluginLoading.set(true);
    pluginError.set(null);
    try {
        // Load built-ins (reads from ~/.local/share/forja/plugins/builtin/)
        await pluginLoadBuiltins();
        // Load user-installed plugins (reads from ~/.local/share/forja/plugins/)
        await pluginScanUserPlugins();
        await refreshPlugins();
        await applyFirstTheme();
    } catch (e) {
        pluginError.set(String(e));
    } finally {
        pluginLoading.set(false);
    }
}

/** Load a plugin from raw Lua source strings (used by the marketplace installer). */
export async function installPlugin(manifestSrc: string, mainSrc: string): Promise<string | null> {
    pluginLoading.set(true);
    pluginError.set(null);
    try {
        const name = await pluginLoad(manifestSrc, mainSrc);
        await refreshPlugins();
        return name;
    } catch (e) {
        pluginError.set(String(e));
        return null;
    } finally {
        pluginLoading.set(false);
    }
}

/** Unload a plugin by name. */
export async function unloadPlugin(name: string): Promise<void> {
    await pluginUnload(name);
    await refreshPlugins();
    if (get(activeTheme)?.name === name) activeTheme.set(null);
}

/** Refresh plugin list from backend. */
export async function refreshPlugins(): Promise<void> {
    loadedPlugins.set(await pluginList());
}

/** Apply the first registered theme from loaded plugins. */
export async function applyFirstTheme(): Promise<void> {
    const themes = await pluginGetThemes();
    if (themes.length > 0) {
        activeTheme.set(themes[0]);
        applyTheme(themes[0]);
    }
}

/** Activate a specific theme by name. */
export async function activateThemeByName(name: string): Promise<void> {
    const themes = await pluginGetThemes();
    const found = themes.find((t) => t.name === name);
    if (found) {
        activeTheme.set(found);
        applyTheme(found);
    }
}
