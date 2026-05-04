pub mod api;
pub mod event_bus;
pub mod manifest;
pub mod permissions;
pub mod runtime;

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::plugin_host::api::themes::ThemeDefinition;
use crate::plugin_host::event_bus::EventPayload;
use crate::plugin_host::manifest::load_manifest;
use crate::plugin_host::runtime::{BracketRange, PluginRuntime};

// ── Built-in Lua sources — embedded only for first-run seed ──────────────────
// These are written to disk on first run so the user can inspect/modify them.
// All subsequent loading is done from disk (runtime), never from binary.

pub(crate) const BUILTIN_SEED: &[(&str, &str, &str, &str)] = &[
    (
        "themes/tokyo-night-dark/manifest.lua",
        include_str!("../../lua/themes/tokyo-night-dark/manifest.lua"),
        "themes/tokyo-night-dark/main.lua",
        include_str!("../../lua/themes/tokyo-night-dark/main.lua"),
    ),
    (
        "themes/misto-dark/manifest.lua",
        include_str!("../../lua/themes/misto-dark/manifest.lua"),
        "themes/misto-dark/main.lua",
        include_str!("../../lua/themes/misto-dark/main.lua"),
    ),
    (
        "themes/misto-light/manifest.lua",
        include_str!("../../lua/themes/misto-light/manifest.lua"),
        "themes/misto-light/main.lua",
        include_str!("../../lua/themes/misto-light/main.lua"),
    ),
    (
        "plugins/bracket-pair-colorizer/manifest.lua",
        include_str!("../../lua/plugins/bracket-pair-colorizer/manifest.lua"),
        "plugins/bracket-pair-colorizer/main.lua",
        include_str!("../../lua/plugins/bracket-pair-colorizer/main.lua"),
    ),
];

// ── Security / Registry configuration ────────────────────────────────────────

/// Official Forja plugin registry — the single trusted source.
/// All plugin downloads must come from this domain.
/// To self-host: change this constant and rebuild.
pub const OFFICIAL_REGISTRY: &str = "https://registry.forja.dev";

/// Returns true when the `FORJA_DEV_MODE` environment variable is set.
/// Dev mode allows downloading plugins from any HTTPS URL (e.g. GitHub raw).
/// **Never run a production release with this env var set.**
pub(crate) fn is_dev_mode() -> bool {
    std::env::var("FORJA_DEV_MODE").is_ok()
}

/// Validate that a URL is safe to download plugin files from.
/// - Production (default): only `OFFICIAL_REGISTRY` domain passes.
/// - Dev mode (`FORJA_DEV_MODE=1`): any HTTPS URL passes (for local testing / GitHub).
pub(crate) fn validate_download_url(url: &str) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("only HTTPS plugin sources are permitted".into());
    }
    if is_dev_mode() {
        eprintln!("[security] FORJA_DEV_MODE active — allowing unofficial source: {}", url);
        return Ok(());
    }
    if !url.starts_with(OFFICIAL_REGISTRY) {
        return Err(format!(
            "plugin source rejected: '{}' is not the official registry.\n\
             Only '{}' is trusted in production.\n\
             Set FORJA_DEV_MODE=1 to allow unofficial sources (development only).",
            url, OFFICIAL_REGISTRY
        ));
    }
    Ok(())
}

/// Compute SHA-256 hex digest of raw bytes.
pub(crate) fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(data);
    hex::encode(h.finalize())
}

/// Verify a file's content against an expected SHA-256 hex string.
/// Returns an error with a descriptive message if the hashes don't match.
pub(crate) fn verify_sha256(content: &str, expected_hex: &str, label: &str) -> Result<(), String> {
    let computed = sha256_hex(content.as_bytes());
    if computed.to_lowercase() != expected_hex.to_lowercase() {
        return Err(format!(
            "integrity check FAILED for '{}': expected {}, got {}.\n\
             The file may have been tampered with. Installation aborted.",
            label, expected_hex, computed
        ));
    }
    Ok(())
}

/// Registry metadata shape for a specific plugin version.
/// Served at: GET {REGISTRY}/plugins/{name}/{version}/meta.json
#[derive(Debug, serde::Deserialize)]
pub(crate) struct RegistryMeta {
    #[allow(dead_code)]
    pub(crate) name: String,
    #[allow(dead_code)]
    pub(crate) version: String,
    pub(crate) manifest_sha256: String,
    pub(crate) main_sha256: String,
}

/// Returns the user's Forja plugins root directory, creating it if needed.
/// ~/.local/share/forja/plugins/   (Linux)
/// ~/Library/Application Support/forja/plugins/   (macOS)
/// %APPDATA%\forja\plugins\   (Windows)
pub(crate) fn plugins_dir() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir()
        .ok_or("cannot determine local data directory")?;
    let dir = base.join("forja").join("plugins");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("cannot create plugins dir: {}", e))?;
    Ok(dir)
}

/// Seed built-in plugins to the plugins directory.
/// Built-in files are always overwritten — they are official and managed by the app binary.
/// User-installed plugins live in separate directories and are never touched here.
pub(crate) fn seed_builtins(plugins_root: &Path) -> Result<(), String> {
    for (manifest_rel, manifest_src, main_rel, main_src) in BUILTIN_SEED {
        let manifest_path = plugins_root.join(manifest_rel);
        let main_path     = plugins_root.join(main_rel);

        if let Some(parent) = manifest_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("mkdir error: {}", e))?;
        }
        std::fs::write(&manifest_path, manifest_src)
            .map_err(|e| format!("write error: {}", e))?;

        if let Some(parent) = main_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("mkdir error: {}", e))?;
        }
        std::fs::write(&main_path, main_src)
            .map_err(|e| format!("write error: {}", e))?;
    }
    Ok(())
}

/// Load a single plugin from a directory that contains manifest.lua + main.lua.
pub(crate) fn load_plugin_from_dir(host: &mut PluginHost, plugin_dir: &Path) -> Result<String, String> {
    let manifest_path = plugin_dir.join("manifest.lua");
    let main_path     = plugin_dir.join("main.lua");

    if !manifest_path.exists() || !main_path.exists() {
        return Err(format!(
            "plugin dir '{}' missing manifest.lua or main.lua",
            plugin_dir.display()
        ));
    }

    let manifest_src = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("read manifest error: {}", e))?;
    let main_src = std::fs::read_to_string(&main_path)
        .map_err(|e| format!("read main.lua error: {}", e))?;

    let name = host.load(&manifest_src, &main_src)?;
    // Store dir_path so the UI can re-enable/reload the plugin
    if let Some(runtime) = host.runtimes.get_mut(&name) {
        runtime.dir_path = Some(plugin_dir.to_string_lossy().to_string());
    }
    Ok(name)
}

// ── PluginHost state ──────────────────────────────────────────────────────────

pub struct PluginHost {
    runtimes: HashMap<String, PluginRuntime>,
}

impl PluginHost {
    pub fn new() -> Self {
        Self {
            runtimes: HashMap::new(),
        }
    }

    pub fn load(&mut self, manifest_src: &str, main_src: &str) -> Result<String, String> {
        let manifest = load_manifest(manifest_src)?;
        let name = manifest.name.clone();
        let runtime = PluginRuntime::new(manifest, main_src)?;
        self.runtimes.insert(name.clone(), runtime);
        Ok(name)
    }

    pub fn unload(&mut self, name: &str) -> bool {
        self.runtimes.remove(name).is_some()
    }

    pub fn list(&self) -> Vec<PluginInfo> {
        self.runtimes
            .values()
            .map(|r| PluginInfo {
                name: r.manifest.name.clone(),
                version: r.manifest.version.clone(),
                kind: r.manifest.kind.to_string(),
                permissions: r.manifest.permissions.clone(),
                commands: r.list_commands(),
                dir_path: r.dir_path.clone().unwrap_or_default(),
            })
            .collect()
    }

    pub fn execute_command(
        &self,
        plugin: &str,
        command: &str,
        buffer: &str,
    ) -> Result<Option<String>, String> {
        let runtime = self
            .runtimes
            .get(plugin)
            .ok_or_else(|| format!("plugin '{}' not loaded", plugin))?;
        runtime.execute_command(command, buffer)
    }

    pub fn emit_event(&self, event_name: &str, payload: EventPayload) -> Vec<EventResult> {
        self.runtimes
            .values()
            .filter_map(|r| match r.emit_event(event_name, payload.clone()) {
                Ok(Some(new_buf)) => Some(EventResult {
                    plugin: r.manifest.name.clone(),
                    buffer: Some(new_buf),
                    error: None,
                }),
                Ok(None) => None,
                Err(e) => Some(EventResult {
                    plugin: r.manifest.name.clone(),
                    buffer: None,
                    error: Some(e),
                }),
            })
            .collect()
    }

    pub fn get_all_themes(&self) -> Vec<ThemeDefinition> {
        self.runtimes
            .values()
            .flat_map(|r| r.get_themes())
            .collect()
    }

    pub fn run_bracket_providers(&self, text: &str, language: &str) -> Vec<BracketRange> {
        self.runtimes
            .values()
            .flat_map(|r| {
                r.run_bracket_providers(text, language)
                    .unwrap_or_else(|e| {
                        eprintln!("[plugin_host] bracket provider '{}' error: {}", r.manifest.name, e);
                        vec![]
                    })
            })
            .collect()
    }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginInfo {
    pub name: String,
    pub version: String,
    pub kind: String,
    pub permissions: Vec<String>,
    pub commands: Vec<String>,
    /// Absolute path to the plugin directory on disk (empty string if loaded from raw source).
    pub dir_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventResult {
    pub plugin: String,
    pub buffer: Option<String>,
    pub error: Option<String>,
}

// ── Tauri commands ────────────────────────────────────────────────────────────
// MOVED — all #[tauri::command] functions below have been moved to
// `crate::commands::plugin_host` (canonical inbound adapter layer).
// The implementations are kept here as commented reference only.
// `lib.rs` now uses `commands::plugin_host::plugin_*` in generate_handler!.

// // pub fn plugin_load_builtins(
//     host: State<'_, std::sync::Mutex<PluginHost>>,
// ) -> Result<Vec<String>, String> {
//     let plugins_root = plugins_dir()?;
//     seed_builtins(&plugins_root)?;
//
//     let mut guard = host.lock().map_err(|e| format!("state lock error: {}", e))?;
//     let mut loaded = Vec::new();
//
//     for (manifest_rel, _, _main_rel, _) in BUILTIN_SEED {
//         let plugin_dir = plugins_root
//             .join(manifest_rel)
//             .parent()
//             .ok_or("invalid builtin path")?
//             .to_path_buf();
//         match load_plugin_from_dir(&mut guard, &plugin_dir) {
//             Ok(name) => loaded.push(name),
//             Err(e) => eprintln!("[plugin_host] skip builtin {}: {}", plugin_dir.display(), e),
//         }
//     }
//     Ok(loaded)
// }
//
// /// Scan the user's plugins directory and load every valid plugin found.
// #[tauri::command]
// pub fn plugin_scan_user_plugins(host: ...) -> Result<Vec<String>, String> { ... }
//
// /// Load a plugin from an absolute directory path.
// #[tauri::command]
// pub fn plugin_load_from_path(path: String, host: ...) -> Result<String, String> { ... }
//
// #[tauri::command]
// pub fn plugin_load(manifest_src: String, main_src: String, host: ...) -> Result<String, String> { ... }
//
// #[tauri::command]
// pub fn plugin_unload(name: String, host: ...) -> Result<bool, String> { ... }
//
// #[tauri::command]
// pub fn plugin_list(host: ...) -> Result<Vec<PluginInfo>, String> { ... }
//
// #[tauri::command]
// pub fn plugin_execute_command(plugin, command, buffer, host) -> Result<Option<String>, String> { ... }
//
// #[tauri::command]
// pub fn plugin_emit_event(event_name, text, language, filepath, host) -> Result<Vec<EventResult>, String> { ... }
//
// #[tauri::command]
// pub fn plugin_get_themes(host) -> Result<Vec<ThemeDefinition>, String> { ... }
//
// #[tauri::command]
// pub fn plugin_run_bracket_providers(text, language, host) -> Result<Vec<BracketRange>, String> { ... }

/// Convert bracket ranges from 1-based UTF-8 byte offsets (Lua convention) to
/// 1-based UTF-16 code unit offsets (JavaScript String convention).
/// BMP characters (U+0000–U+FFFF) occupy 1 UTF-16 unit; supplementary characters
/// (e.g. emoji) occupy 2. ASCII characters are always 1 byte = 1 UTF-16 unit.
pub(crate) fn byte_ranges_to_utf16(text: &str, ranges: Vec<BracketRange>) -> Vec<BracketRange> {
    if ranges.is_empty() {
        return ranges;
    }

    // Collect all unique 0-based byte offsets we need to convert, then sort them
    // so we can walk the text once in a single O(n) pass.
    let mut offsets: Vec<usize> = ranges
        .iter()
        .flat_map(|r| [r.start.saturating_sub(1), r.finish.saturating_sub(1)])
        .collect();
    offsets.sort_unstable();
    offsets.dedup();

    // Single forward walk: track current byte index and UTF-16 unit count.
    let mut byte_to_utf16: std::collections::HashMap<usize, usize> =
        std::collections::HashMap::with_capacity(offsets.len());
    let mut utf16_count: usize = 0;
    let mut prev_byte: usize = 0;

    for &target_byte in &offsets {
        let slice = &text[prev_byte..target_byte.min(text.len())];
        utf16_count += slice.encode_utf16().count();
        byte_to_utf16.insert(target_byte, utf16_count);
        prev_byte = target_byte.min(text.len());
    }

    let convert = |byte_pos: usize| -> usize {
        // byte_pos is 1-based; convert to 0-based, look up, then back to 1-based
        let key = byte_pos.saturating_sub(1).min(text.len());
        byte_to_utf16.get(&key).copied().unwrap_or(key) + 1
    };

    ranges
        .into_iter()
        .map(|r| BracketRange {
            start:  convert(r.start),
            finish: convert(r.finish),
            depth:  r.depth,
        })
        .collect()
}

// ── Registry install commands ─────────────────────────────────────────────────
// MOVED to crate::commands::plugin_host — see that file for implementations.

/// Save plugin source files to the appropriate user data subdirectory and load them.
/// Helper shared by both install commands (`plugin_install_from_registry` and
/// `plugin_install_from_url`). Not a Tauri command — called internally.
pub(crate) async fn install_plugin_files(
    manifest_src: String,
    main_src: String,
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<String, String> {
    use crate::plugin_host::manifest::PluginKind;

    let manifest = crate::plugin_host::manifest::load_manifest(&manifest_src)?;
    let subdir = match manifest.kind {
        PluginKind::Theme  => "themes",
        PluginKind::Plugin => "plugins",
    };

    let plugin_dir = plugins_dir()?.join(subdir).join(&manifest.name);
    std::fs::create_dir_all(&plugin_dir)
        .map_err(|e| format!("create plugin dir error: {}", e))?;
    std::fs::write(plugin_dir.join("manifest.lua"), &manifest_src)
        .map_err(|e| format!("write manifest error: {}", e))?;
    std::fs::write(plugin_dir.join("main.lua"), &main_src)
        .map_err(|e| format!("write main.lua error: {}", e))?;

    // Load into runtime (brief Mutex lock — no await after here)
    let mut guard = host.lock().map_err(|e| format!("state lock error: {}", e))?;
    load_plugin_from_dir(&mut guard, &plugin_dir)
}

// /// Install a plugin from the official Forja registry by name + version.
// /// MOVED to crate::commands::plugin_host::plugin_install_from_registry
// #[tauri::command]
// pub async fn plugin_install_from_registry(name, version, host) -> Result<String, String> { ... }

// /// Install a plugin from explicit manifest + main URLs with mandatory hash verification.
// /// MOVED to crate::commands::plugin_host::plugin_install_from_url
// #[tauri::command]
// pub async fn plugin_install_from_url(manifest_url, main_url, manifest_sha256, main_sha256, host) -> Result<String, String> { ... }

// /// Returns the current registry configuration and security mode.
// /// MOVED to crate::commands::plugin_host::plugin_registry_info
// #[tauri::command]
// pub fn plugin_registry_info() -> serde_json::Value { ... }
