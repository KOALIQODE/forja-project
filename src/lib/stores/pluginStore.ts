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
/** Becomes true once initPlugins() has fully completed (used to trigger bracket colorizer). */
export const pluginsReady  = writable(false);

// ── Derived stores ────────────────────────────────────────────────────────────

export const pluginList$  = derived(loadedPlugins, ($p) => $p.filter((p) => p.kind === "plugin"));
export const themeList$   = derived(loadedPlugins, ($p) => $p.filter((p) => p.kind === "theme"));
export const allCommands$ = derived(loadedPlugins, ($p) =>
    $p.flatMap((p) => p.commands.map((cmd) => ({ plugin: p.name, command: cmd })))
);

// ── Actions ───────────────────────────────────────────────────────────────────

/** Initialize built-in plugins then scan user plugin directory. */
export async function initPlugins(): Promise<void> {
    pluginsReady.set(false);
    pluginLoading.set(true);
    pluginError.set(null);
    try {
        const builtins = await pluginLoadBuiltins();
        console.log("[plugins] builtins loaded:", builtins);

        const userPlugins = await pluginScanUserPlugins();
        console.log("[plugins] user plugins scanned:", userPlugins);

        await refreshPlugins();
        const list = get(loadedPlugins);
        console.log("[plugins] all loaded plugins:", list.map(p => `${p.name} (${p.kind})`));

        // Only apply theme if user explicitly activated one before
        await applyFirstTheme();
        const theme = get(activeTheme);
        console.log("[plugins] active theme:", theme?.name ?? "none");
    } catch (e) {
        console.error("[plugins] initPlugins error:", e);
        pluginError.set(String(e));
    } finally {
        pluginLoading.set(false);
        // Signal that plugins are fully ready — EditorBuffer listens to this
        pluginsReady.set(true);
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

/** Apply theme only if user previously activated one (reads localStorage preference).
 *  On first run (no preference saved), no theme is applied — user must activate manually. */
export async function applyFirstTheme(): Promise<void> {
    const savedTheme = localStorage.getItem("forja:activeTheme");
    // No preference saved = first run, don't activate anything
    if (!savedTheme) return;
    // User explicitly deactivated
    if (savedTheme === "__none__") return;

    const themes = await pluginGetThemes();
    if (themes.length === 0) return;

    const target = themes.find((t) => t.name === savedTheme) ?? null;
    if (target) {
        activeTheme.set(target);
        applyTheme(target);
    }
}

/** Activate a specific theme by name. */
export async function activateThemeByName(name: string): Promise<void> {
    const themes = await pluginGetThemes();
    const found = themes.find((t) => t.name === name);
    if (found) {
        activeTheme.set(found);
        applyTheme(found);
        localStorage.setItem("forja:activeTheme", name);
    }
}
