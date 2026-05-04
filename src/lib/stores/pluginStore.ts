import { writable, derived, get } from "svelte/store";
import {
    pluginLoadBuiltins,
    pluginLoad,
    pluginList,
    pluginUnload,
    pluginGetThemes,
    pluginScanUserPlugins,
    pluginLoadFromPath,
    type PluginInfo,
    type ThemeDefinition,
    type BracketRange,
} from "$lib/utils/pluginClient";
import { loadUIThemesFromBackend } from '$lib/stores/uiThemeStore';
import { applyTheme } from "$lib/utils/themeEngine";

// ── Core writable stores ──────────────────────────────────────────────────────

export const loadedPlugins = writable<PluginInfo[]>([]);
/** All plugins/themes ever discovered (loaded + disabled). Preserved across disable/enable. */
export const knownPlugins  = writable<PluginInfo[]>([]);
export const activeTheme   = writable<ThemeDefinition | null>(null);
export const bracketRanges = writable<BracketRange[]>([]);
export const pluginLoading = writable(false);
export const pluginError   = writable<string | null>(null);
/** Becomes true once initPlugins() has fully completed (used to trigger bracket colorizer). */
export const pluginsReady  = writable(false);
/** Increments each time a plugin is loaded or unloaded at runtime — EditorBuffer uses this to re-run bracket analysis. */
export const pluginActivityVersion = writable(0);

// ── Disabled plugin names (persisted in localStorage) ────────────────────────

const DISABLED_KEY = "forja:disabledPlugins";
const DEFAULT_DISABLED = ["bracket-pair-colorizer"];

function loadDisabledSet(): Set<string> {
    try {
        const saved = localStorage.getItem(DISABLED_KEY);
        if (saved === null) {
            // First run — disable bracket-pair-colorizer by default
            localStorage.setItem(DISABLED_KEY, JSON.stringify(DEFAULT_DISABLED));
            return new Set(DEFAULT_DISABLED);
        }
        return new Set(JSON.parse(saved) as string[]);
    } catch {
        return new Set(DEFAULT_DISABLED);
    }
}

function saveDisabledSet(set: Set<string>): void {
    localStorage.setItem(DISABLED_KEY, JSON.stringify([...set]));
}

export const disabledPluginNames = writable<Set<string>>(new Set());

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

    // Load disabled set from localStorage (first run defaults to bracket-pair-colorizer off)
    const disabled = loadDisabledSet();
    disabledPluginNames.set(disabled);

    try {
        const builtins = await pluginLoadBuiltins();
        console.log("[plugins] builtins loaded:", builtins);

        const userPlugins = await pluginScanUserPlugins();
        console.log("[plugins] user plugins scanned:", userPlugins);

        // Capture full list BEFORE unloading disabled ones, so knownPlugins always has all info
        const allLoaded = await pluginList();
        knownPlugins.set(allLoaded);
        loadedPlugins.set(allLoaded);

        // Unload any plugins the user has previously disabled
        for (const name of disabled) {
            try { await pluginUnload(name); } catch { /* not loaded = already fine */ }
        }

        await refreshPlugins();
        const list = get(loadedPlugins);
        console.log("[plugins] all loaded plugins:", list.map(p => `${p.name} (${p.kind})`));

        await applyFirstTheme();
        await loadUIThemesFromBackend();
        console.log('[plugins] UI themes loaded from backend');
        const theme = get(activeTheme);
        console.log("[plugins] active theme:", theme?.name ?? "none");
    } catch (e) {
        console.error("[plugins] initPlugins error:", e);
        pluginError.set(String(e));
    } finally {
        pluginLoading.set(false);
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
        // Merge into knownPlugins if new
        knownPlugins.update(known => {
            const loaded = get(loadedPlugins);
            const names = new Set(known.map(p => p.name));
            return [...known, ...loaded.filter(p => !names.has(p.name))];
        });
        return name;
    } catch (e) {
        pluginError.set(String(e));
        return null;
    } finally {
        pluginLoading.set(false);
    }
}

/** Disable a plugin: unload it, persist to disabled set, clear bracket colors if needed. */
export async function disablePlugin(name: string): Promise<void> {
    await pluginUnload(name);
    await refreshPlugins();
    bracketRanges.set([]);
    pluginActivityVersion.update(v => v + 1);
    disabledPluginNames.update(set => {
        const next = new Set(set);
        next.add(name);
        saveDisabledSet(next);
        return next;
    });
    if (get(activeTheme)?.name === name) activeTheme.set(null);
    await loadUIThemesFromBackend();
}

/** Enable a plugin: remove from disabled set, reload it. */
export async function enablePlugin(plugin: PluginInfo): Promise<void> {
    try {
        if (plugin.dir_path) {
            await pluginLoadFromPath(plugin.dir_path);
        } else {
            // Builtin — reload all builtins; backend skips already-loaded ones
            await pluginLoadBuiltins();
        }
    } catch (e) {
        console.error("[plugins] enablePlugin error:", e);
    }
    await refreshPlugins();
    pluginActivityVersion.update(v => v + 1);
    disabledPluginNames.update(set => {
        const next = new Set(set);
        next.delete(plugin.name);
        saveDisabledSet(next);
        return next;
    });
    await loadUIThemesFromBackend();
}

/** Unload a plugin by name. */
export async function unloadPlugin(name: string): Promise<void> {
    await pluginUnload(name);
    await refreshPlugins();
    if (get(activeTheme)?.name === name) activeTheme.set(null);
}

/** Refresh plugin list from backend. */
export async function refreshPlugins(): Promise<void> {
    const list = await pluginList();
    loadedPlugins.set(list);
    // Merge any newly discovered plugins into knownPlugins
    knownPlugins.update(known => {
        const names = new Set(known.map(p => p.name));
        return [...known, ...list.filter(p => !names.has(p.name))];
    });
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
