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

/** One permission entry returned by `plugin_preflight`. */
export interface PermissionDetail {
    id: string;
    description: string;
    /** "low" | "medium" | "high" | "unknown" */
    risk: string;
}

/** Pre-flight manifest info — returned WITHOUT loading the plugin. */
export interface PluginPreflightInfo {
    name: string;
    version: string;
    kind: "plugin" | "theme";
    permissions: PermissionDetail[];
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

export interface BgGradient {
    from: string;
    to: string;
    steps: number;
    angle: number;
}

export interface ThemePreview {
    bg: string;
    accent: string;
    text: string;
}

export interface ThemeUI {
    kind: 'dark' | 'light';
    bg_gradient: BgGradient;
    preview: ThemePreview;
    vars: Record<string, string>;
}

export interface ThemeDefinition {
    name: string;
    colors: ThemeColors;
    syntax: ThemeSyntax;
    brackets: string[];
    ui?: ThemeUI;
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

/**
 * Parse a plugin's manifest.lua source and return its metadata + permission
 * details WITHOUT loading the plugin into the runtime.
 * Call this before any install or load-from-path to show the consent dialog.
 */
export async function pluginPreflight(manifestSrc: string): Promise<PluginPreflightInfo> {
    return invoke<PluginPreflightInfo>("plugin_preflight", { manifestSrc });
}

/** Load all built-in plugins embedded in the binary (themes + bracket-pair-colorizer). */
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

// ── Registry install ──────────────────────────────────────────────────────────

export interface RegistryInfo {
    registry_url: string;
    dev_mode: boolean;
    warning: string | null;
}

/**
 * Install a plugin from the official Forja registry.
 * The backend fetches meta.json for hashes, downloads both Lua files,
 * verifies SHA-256, saves to disk, and loads into the runtime.
 */
export async function pluginInstallFromRegistry(
    name: string,
    version: string
): Promise<string> {
    return invoke<string>("plugin_install_from_registry", { name, version });
}

/**
 * Install a plugin from explicit manifest + main URLs.
 * SHA-256 hashes are mandatory and always verified.
 *
 * Security:
 * - Production: URLs must start with the official registry domain.
 * - Dev mode (FORJA_DEV_MODE=1 set on the binary): any HTTPS URL is accepted.
 */
export async function pluginInstallFromUrl(
    manifestUrl: string,
    mainUrl: string,
    manifestSha256: string,
    mainSha256: string
): Promise<string> {
    return invoke<string>("plugin_install_from_url", {
        manifestUrl,
        mainUrl,
        manifestSha256,
        mainSha256,
    });
}

/** Returns current registry URL and whether dev mode is active. */
export async function pluginRegistryInfo(): Promise<RegistryInfo> {
    return invoke<RegistryInfo>("plugin_registry_info");
}
