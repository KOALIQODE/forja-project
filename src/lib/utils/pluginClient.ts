import { invoke } from "@tauri-apps/api/core";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface PluginInfo {
    name: string;
    version: string;
    kind: "plugin" | "theme";
    permissions: string[];
    commands: string[];
    /** Absolute path to the plugin directory on disk. Empty if loaded from raw source. */
    dir_path: string;
}

export interface ThemeColors {
    bg?: string;
    fg?: string;
    cursor?: string;
    selection?: string;
    line_number?: string;
    gutter_bg?: string;
    border?: string;
    active_line?: string;
}

export interface ThemeSyntax {
    keyword?: string;
    string?: string;
    function_name?: string;
    variable?: string;
    type?: string;
    constant?: string;
    comment?: string;
    operator?: string;
    number?: string;
    punctuation?: string;
    attribute?: string;
    tag?: string;
    namespace?: string;
}

export interface ThemeDefinition {
    name: string;
    colors: ThemeColors;
    syntax: ThemeSyntax;
    brackets: string[];
}

export interface BracketRange {
    start: number;
    finish: number;
    depth: number;
}

export interface EventResult {
    plugin: string;
    buffer: string | null;
    error: string | null;
}

// ── API calls ─────────────────────────────────────────────────────────────────

/** Load all built-in plugins embedded in the binary (tokyo-night-dark + bracket-pair-colorizer). */
export async function pluginLoadBuiltins(): Promise<string[]> {
    return invoke<string[]>("plugin_load_builtins");
}

/** Scan ~/.local/share/forja/plugins/ and load every valid plugin found at runtime. */
export async function pluginScanUserPlugins(): Promise<string[]> {
    return invoke<string[]>("plugin_scan_user_plugins");
}

/** Load a plugin from an absolute directory path on disk (marketplace installer). */
export async function pluginLoadFromPath(path: string): Promise<string> {
    return invoke<string>("plugin_load_from_path", { path });
}

/** Load a plugin from its manifest source and main source strings. */
export async function pluginLoad(
    manifestSrc: string,
    mainSrc: string
): Promise<string> {
    return invoke<string>("plugin_load", {
        manifestSrc,
        mainSrc,
    });
}

/** Unload a plugin by name. */
export async function pluginUnload(name: string): Promise<boolean> {
    return invoke<boolean>("plugin_unload", { name });
}

/** List all currently loaded plugins. */
export async function pluginList(): Promise<PluginInfo[]> {
    return invoke<PluginInfo[]>("plugin_list");
}

/** Execute a named command from a specific plugin. Returns new buffer if modified. */
export async function pluginExecuteCommand(
    plugin: string,
    command: string,
    buffer: string
): Promise<string | null> {
    return invoke<string | null>("plugin_execute_command", {
        plugin,
        command,
        buffer,
    });
}

/** Emit an editor lifecycle event to all loaded plugins. */
export async function pluginEmitEvent(
    eventName: string,
    text?: string,
    language?: string,
    filepath?: string
): Promise<EventResult[]> {
    return invoke<EventResult[]>("plugin_emit_event", {
        eventName,
        text: text ?? null,
        language: language ?? null,
        filepath: filepath ?? null,
    });
}

/** Get all registered themes from all loaded plugins. */
export async function pluginGetThemes(): Promise<ThemeDefinition[]> {
    return invoke<ThemeDefinition[]>("plugin_get_themes");
}

/** Run all bracket providers on the given text. Returns ranges with depth. */
export async function pluginRunBracketProviders(
    text: string,
    language: string
): Promise<BracketRange[]> {
    return invoke<BracketRange[]>("plugin_run_bracket_providers", {
        text,
        language,
    });
}
