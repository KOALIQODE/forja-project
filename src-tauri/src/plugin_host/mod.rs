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

const BUILTIN_SEED: &[(&str, &str, &str, &str)] = &[
    (
        "themes/tokyo-night-dark/manifest.lua",
        include_str!("../../lua/themes/tokyo-night-dark/manifest.lua"),
        "themes/tokyo-night-dark/main.lua",
        include_str!("../../lua/themes/tokyo-night-dark/main.lua"),
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
fn is_dev_mode() -> bool {
    std::env::var("FORJA_DEV_MODE").is_ok()
}

/// Validate that a URL is safe to download plugin files from.
/// - Production (default): only `OFFICIAL_REGISTRY` domain passes.
/// - Dev mode (`FORJA_DEV_MODE=1`): any HTTPS URL passes (for local testing / GitHub).
fn validate_download_url(url: &str) -> Result<(), String> {
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
fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(data);
    hex::encode(h.finalize())
}

/// Verify a file's content against an expected SHA-256 hex string.
/// Returns an error with a descriptive message if the hashes don't match.
fn verify_sha256(content: &str, expected_hex: &str, label: &str) -> Result<(), String> {
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
struct RegistryMeta {
    #[allow(dead_code)]
    name: String,
    #[allow(dead_code)]
    version: String,
    manifest_sha256: String,
    main_sha256: String,
}

/// Returns the user's Forja plugins root directory, creating it if needed.
/// ~/.local/share/forja/plugins/   (Linux)
/// ~/Library/Application Support/forja/plugins/   (macOS)
/// %APPDATA%\forja\plugins\   (Windows)
fn plugins_dir() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir()
        .ok_or("cannot determine local data directory")?;
    let dir = base.join("forja").join("plugins");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("cannot create plugins dir: {}", e))?;
    Ok(dir)
}

/// Seed built-in plugins to the plugins directory if not already present.
fn seed_builtins(plugins_root: &Path) -> Result<(), String> {
    for (manifest_rel, manifest_src, main_rel, main_src) in BUILTIN_SEED {
        let manifest_path = plugins_root.join(manifest_rel);
        let main_path     = plugins_root.join(main_rel);

        // Only write if the file doesn't exist yet (preserve user edits)
        if !manifest_path.exists() {
            if let Some(parent) = manifest_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("mkdir error: {}", e))?;
            }
            std::fs::write(&manifest_path, manifest_src)
                .map_err(|e| format!("write error: {}", e))?;
        }
        if !main_path.exists() {
            if let Some(parent) = main_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("mkdir error: {}", e))?;
            }
            std::fs::write(&main_path, main_src)
                .map_err(|e| format!("write error: {}", e))?;
        }
    }
    Ok(())
}

/// Load a single plugin from a directory that contains manifest.lua + main.lua.
fn load_plugin_from_dir(host: &mut PluginHost, plugin_dir: &Path) -> Result<String, String> {
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

/// Seed built-in plugins to the user's data directory (first-run only),
/// then load them into the runtime. Safe to call on every startup.
#[tauri::command]
pub fn plugin_load_builtins(
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<Vec<String>, String> {
    let plugins_root = plugins_dir()?;
    seed_builtins(&plugins_root)?;

    let mut guard = host.lock().map_err(|e| format!("state lock error: {}", e))?;
    let mut loaded = Vec::new();

    for (manifest_rel, _, _main_rel, _) in BUILTIN_SEED {
        // Derive the plugin directory from the manifest path
        let plugin_dir = plugins_root
            .join(manifest_rel)
            .parent()
            .ok_or("invalid builtin path")?
            .to_path_buf();

        match load_plugin_from_dir(&mut guard, &plugin_dir) {
            Ok(name) => loaded.push(name),
            Err(e) => eprintln!("[plugin_host] skip builtin {}: {}", plugin_dir.display(), e),
        }
    }
    Ok(loaded)
}

/// Scan the user's plugins directory and load every valid plugin found.
/// Already-loaded plugins are reloaded (allows hot-reload after install).
#[tauri::command]
pub fn plugin_scan_user_plugins(
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<Vec<String>, String> {
    let plugins_root = plugins_dir()?;
    let mut guard = host.lock().map_err(|e| format!("state lock error: {}", e))?;
    let mut loaded = Vec::new();

    // Scan plugins/ and themes/ subdirectories
    for sub in &["plugins", "themes"] {
        let sub_dir = plugins_root.join(sub);
        if !sub_dir.exists() { continue; }

        let entries = std::fs::read_dir(&sub_dir)
            .map_err(|e| format!("read_dir error: {}", e))?;

        for entry in entries.flatten() {
            let plugin_dir = entry.path();
            if !plugin_dir.is_dir() { continue; }

            match load_plugin_from_dir(&mut guard, &plugin_dir) {
                Ok(name) => loaded.push(name),
                Err(e) => eprintln!("[plugin_host] skip {}: {}", plugin_dir.display(), e),
            }
        }
    }
    Ok(loaded)
}

/// Load a plugin from an absolute directory path (used by the marketplace installer).
#[tauri::command]
pub fn plugin_load_from_path(
    path: String,
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<String, String> {
    let plugin_dir = PathBuf::from(&path);
    let mut guard = host.lock().map_err(|e| format!("state lock error: {}", e))?;
    load_plugin_from_dir(&mut guard, &plugin_dir)
}

#[tauri::command]
pub fn plugin_load(
    manifest_src: String,
    main_src: String,
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<String, String> {
    host.lock()
        .map_err(|e| format!("state lock error: {}", e))?
        .load(&manifest_src, &main_src)
}

#[tauri::command]
pub fn plugin_unload(
    name: String,
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<bool, String> {
    Ok(host
        .lock()
        .map_err(|e| format!("state lock error: {}", e))?
        .unload(&name))
}

#[tauri::command]
pub fn plugin_list(
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<Vec<PluginInfo>, String> {
    Ok(host
        .lock()
        .map_err(|e| format!("state lock error: {}", e))?
        .list())
}

#[tauri::command]
pub fn plugin_execute_command(
    plugin: String,
    command: String,
    buffer: String,
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<Option<String>, String> {
    host.lock()
        .map_err(|e| format!("state lock error: {}", e))?
        .execute_command(&plugin, &command, &buffer)
}

#[tauri::command]
pub fn plugin_emit_event(
    event_name: String,
    text: Option<String>,
    language: Option<String>,
    filepath: Option<String>,
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<Vec<EventResult>, String> {
    let payload = EventPayload { text, language, filepath };
    Ok(host
        .lock()
        .map_err(|e| format!("state lock error: {}", e))?
        .emit_event(&event_name, payload))
}

#[tauri::command]
pub fn plugin_get_themes(
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<Vec<ThemeDefinition>, String> {
    Ok(host
        .lock()
        .map_err(|e| format!("state lock error: {}", e))?
        .get_all_themes())
}

#[tauri::command]
pub fn plugin_run_bracket_providers(
    text: String,
    language: String,
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<Vec<BracketRange>, String> {
    let ranges = host
        .lock()
        .map_err(|e| format!("state lock error: {}", e))?
        .run_bracket_providers(&text, &language);

    // Lua iterates the text as raw UTF-8 bytes and returns 1-based byte offsets.
    // JavaScript's String indexing uses UTF-16 code units. For ASCII-only content
    // these are identical, but files with non-ASCII characters (Unicode in comments,
    // strings, identifiers) before a bracket would produce wrong positions.
    // Convert here once so the frontend always receives UTF-16 code unit offsets.
    Ok(byte_ranges_to_utf16(&text, ranges))
}

/// Convert bracket ranges from 1-based UTF-8 byte offsets (Lua convention) to
/// 1-based UTF-16 code unit offsets (JavaScript String convention).
/// BMP characters (U+0000–U+FFFF) occupy 1 UTF-16 unit; supplementary characters
/// (e.g. emoji) occupy 2. ASCII characters are always 1 byte = 1 UTF-16 unit.
fn byte_ranges_to_utf16(text: &str, ranges: Vec<BracketRange>) -> Vec<BracketRange> {
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

/// Save plugin source files to the appropriate user data subdirectory and load them.
/// Helper shared by both install commands.
async fn install_plugin_files(
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

/// Install a plugin from the official Forja registry by name + version.
///
/// Flow: fetch meta.json (hashes) → download manifest.lua + main.lua →
///       verify SHA-256 → save to ~/.local/share/forja/plugins/ → load.
///
/// Registry endpoints expected:
///   GET {REGISTRY}/plugins/{name}/{version}/meta.json
///   GET {REGISTRY}/plugins/{name}/{version}/manifest.lua
///   GET {REGISTRY}/plugins/{name}/{version}/main.lua
#[tauri::command]
pub async fn plugin_install_from_registry(
    name: String,
    version: String,
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<String, String> {
    let base = OFFICIAL_REGISTRY;
    let meta_url     = format!("{}/plugins/{}/{}/meta.json",   base, name, version);
    let manifest_url = format!("{}/plugins/{}/{}/manifest.lua", base, name, version);
    let main_url     = format!("{}/plugins/{}/{}/main.lua",     base, name, version);

    let client = reqwest::Client::new();

    // 1. Fetch metadata (SHA-256 hashes for integrity verification)
    let meta: RegistryMeta = client
        .get(&meta_url)
        .send()
        .await
        .map_err(|e| format!("registry unreachable ({}): {}", meta_url, e))?
        .json()
        .await
        .map_err(|e| format!("registry meta parse error: {}", e))?;

    // 2. Download plugin source files
    let manifest_src = client.get(&manifest_url)
        .send().await.map_err(|e| format!("download manifest error: {}", e))?
        .text().await.map_err(|e| format!("read manifest error: {}", e))?;

    let main_src = client.get(&main_url)
        .send().await.map_err(|e| format!("download main.lua error: {}", e))?
        .text().await.map_err(|e| format!("read main.lua error: {}", e))?;

    // 3. Integrity check BEFORE touching disk
    verify_sha256(&manifest_src, &meta.manifest_sha256, "manifest.lua")?;
    verify_sha256(&main_src,     &meta.main_sha256,     "main.lua")?;

    // 4. Save + load
    install_plugin_files(manifest_src, main_src, host).await
}

/// Install a plugin from explicit manifest + main URLs with mandatory hash verification.
///
/// Security:
/// - Production: `manifest_url` and `main_url` must start with `OFFICIAL_REGISTRY`.
/// - Dev mode (`FORJA_DEV_MODE=1`): any HTTPS URL is accepted (GitHub raw, localhost, etc.).
/// - SHA-256 hashes are ALWAYS verified regardless of mode — no bypassing.
#[tauri::command]
pub async fn plugin_install_from_url(
    manifest_url:    String,
    main_url:        String,
    manifest_sha256: String,
    main_sha256:     String,
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<String, String> {
    // Security gate — reject non-HTTPS or non-registry URLs in production
    validate_download_url(&manifest_url)?;
    validate_download_url(&main_url)?;

    let client = reqwest::Client::new();

    let manifest_src = client.get(&manifest_url)
        .send().await.map_err(|e| format!("download manifest error: {}", e))?
        .text().await.map_err(|e| format!("read manifest error: {}", e))?;

    let main_src = client.get(&main_url)
        .send().await.map_err(|e| format!("download main.lua error: {}", e))?
        .text().await.map_err(|e| format!("read main.lua error: {}", e))?;

    // Hash verification is ALWAYS mandatory
    verify_sha256(&manifest_src, &manifest_sha256, "manifest.lua")?;
    verify_sha256(&main_src,     &main_sha256,     "main.lua")?;

    install_plugin_files(manifest_src, main_src, host).await
}

/// Returns the current registry configuration and security mode.
/// Useful for the Extensions UI to display "Connected to registry.forja.dev"
/// or a "⚠ DEV MODE" badge.
#[tauri::command]
pub fn plugin_registry_info() -> serde_json::Value {
    serde_json::json!({
        "registry_url": OFFICIAL_REGISTRY,
        "dev_mode": is_dev_mode(),
        "warning": if is_dev_mode() {
            Some("FORJA_DEV_MODE is active — unofficial plugin sources are allowed. Do not use in production.")
        } else {
            None
        }
    })
}
