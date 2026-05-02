//! Plugin Host commands — inbound adapters for the Lua plugin runtime.
//!
//! # Hexagonal Architecture
//! These are the canonical `#[tauri::command]` handlers for all plugin operations.
//! They delegate to [`crate::plugin_host::PluginHost`] (bounded context) which owns
//! the isolated Lua VMs and plugin state.
//!
//! Previously these commands lived in `plugin_host/mod.rs`.
//! The originals are kept there as commented-out code for historical reference.
//!
//! # Commands
//! | Command | Description |
//! |---------|-------------|
//! | `plugin_load_builtins` | Seed + load built-in themes/plugins on first run |
//! | `plugin_scan_user_plugins` | Scan user data dir and hot-reload all plugins |
//! | `plugin_load_from_path` | Load a plugin from an absolute directory path |
//! | `plugin_load` | Load plugin from raw manifest + main Lua source |
//! | `plugin_unload` | Unload a plugin by name |
//! | `plugin_list` | List all loaded plugins and their metadata |
//! | `plugin_execute_command` | Execute a named command registered by a plugin |
//! | `plugin_emit_event` | Fire an event to all loaded plugins |
//! | `plugin_get_themes` | Collect all themes registered by loaded plugins |
//! | `plugin_run_bracket_providers` | Run bracket-pair colorizer providers |
//! | `plugin_install_from_registry` | Install from official Forja registry |
//! | `plugin_install_from_url` | Install from explicit HTTPS URLs |
//! | `plugin_registry_info` | Return current registry + security mode info |

// ── Previous re-export shim (SUPERSEDED) ─────────────────────────────────────
// #[allow(unused_imports)]
// pub use crate::plugin_host::{
//     plugin_load_builtins, plugin_scan_user_plugins, plugin_load_from_path,
//     plugin_load, plugin_unload, plugin_list, plugin_execute_command,
//     plugin_emit_event, plugin_get_themes, plugin_run_bracket_providers,
//     plugin_install_from_registry, plugin_install_from_url, plugin_registry_info,
// };

use std::path::PathBuf;

use tauri::State;

use crate::domain::plugin::BracketRange;
use crate::infrastructure::plugin::themes::ThemeDefinition;
use crate::plugin_host::{
    EventResult, PluginHost, PluginInfo,
    BUILTIN_SEED, OFFICIAL_REGISTRY,
    byte_ranges_to_utf16, install_plugin_files, is_dev_mode,
    load_plugin_from_dir, plugins_dir, seed_builtins, validate_download_url,
    verify_sha256, RegistryMeta,
};
use crate::plugin_host::event_bus::EventPayload;

// ── Lifecycle commands ────────────────────────────────────────────────────────

/// Seed built-in plugins to the user's data directory (first-run only),
/// then load them into the runtime. Safe to call on every startup —
/// files are only written if they do not already exist (preserves user edits).
#[tauri::command]
pub fn plugin_load_builtins(
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<Vec<String>, String> {
    let plugins_root = plugins_dir()?;
    seed_builtins(&plugins_root)?;

    let mut guard = host.lock().map_err(|e| format!("state lock error: {}", e))?;
    let mut loaded = Vec::new();

    for (manifest_rel, _, _main_rel, _) in BUILTIN_SEED {
        // Derive the plugin directory from the manifest relative path
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

/// Scan the user's plugins directory (`~/.local/share/forja/plugins/`) and
/// load every valid plugin/theme found. Already-loaded plugins are reloaded,
/// enabling hot-reload after a marketplace install.
#[tauri::command]
pub fn plugin_scan_user_plugins(
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<Vec<String>, String> {
    let plugins_root = plugins_dir()?;
    let mut guard = host.lock().map_err(|e| format!("state lock error: {}", e))?;
    let mut loaded = Vec::new();

    // Scan both `plugins/` and `themes/` subdirectories
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

/// Load a plugin from an absolute directory path on disk.
/// The directory must contain `manifest.lua` and `main.lua`.
/// Used by the marketplace installer after downloading plugin files.
#[tauri::command]
pub fn plugin_load_from_path(
    path: String,
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<String, String> {
    let plugin_dir = PathBuf::from(&path);
    let mut guard = host.lock().map_err(|e| format!("state lock error: {}", e))?;
    load_plugin_from_dir(&mut guard, &plugin_dir)
}

/// Load a plugin from raw Lua source strings (manifest + main).
/// Useful for testing plugins before saving them to disk.
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

/// Unload a plugin by name, freeing its Lua VM and registered resources.
/// Returns `true` if the plugin was loaded and is now unloaded; `false` if it
/// was not found.
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

// ── Runtime commands ──────────────────────────────────────────────────────────

/// Return metadata for all currently loaded plugins (name, version, kind,
/// permissions, registered commands, and disk path).
#[tauri::command]
pub fn plugin_list(
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<Vec<PluginInfo>, String> {
    Ok(host
        .lock()
        .map_err(|e| format!("state lock error: {}", e))?
        .list())
}

/// Execute a named command registered by a specific plugin.
/// Returns the new buffer content if the plugin modified the buffer, or `None`
/// if the buffer was unchanged.
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

/// Fire a named event to all loaded plugins (e.g. `on_open`, `on_save`).
/// Returns the list of plugins that produced a modified buffer.
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

/// Collect all `ThemeDefinition` objects registered by loaded theme plugins.
#[tauri::command]
pub fn plugin_get_themes(
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<Vec<ThemeDefinition>, String> {
    Ok(host
        .lock()
        .map_err(|e| format!("state lock error: {}", e))?
        .get_all_themes())
}

/// Run all bracket-pair colorizer providers registered by loaded plugins.
///
/// Lua returns 1-based UTF-8 **byte** offsets; this command converts them to
/// 1-based UTF-16 code unit offsets before returning (JavaScript `String`
/// indexing uses UTF-16).
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

    // Convert Lua byte offsets → JS UTF-16 code unit offsets
    Ok(byte_ranges_to_utf16(&text, ranges))
}

// ── Registry install commands ─────────────────────────────────────────────────

/// Install a plugin from the official Forja registry by name + version.
///
/// Flow: fetch `meta.json` (SHA-256 hashes) → download `manifest.lua` + `main.lua`
///       → verify SHA-256 → save to user data dir → load into runtime.
///
/// Registry endpoints expected:
/// - `GET {REGISTRY}/plugins/{name}/{version}/meta.json`
/// - `GET {REGISTRY}/plugins/{name}/{version}/manifest.lua`
/// - `GET {REGISTRY}/plugins/{name}/{version}/main.lua`
#[tauri::command]
pub async fn plugin_install_from_registry(
    name: String,
    version: String,
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<String, String> {
    let base         = OFFICIAL_REGISTRY;
    let meta_url     = format!("{}/plugins/{}/{}/meta.json",    base, name, version);
    let manifest_url = format!("{}/plugins/{}/{}/manifest.lua", base, name, version);
    let main_url     = format!("{}/plugins/{}/{}/main.lua",     base, name, version);

    let client = reqwest::Client::new();

    // 1. Fetch metadata — contains SHA-256 hashes for integrity verification
    let meta: RegistryMeta = client
        .get(&meta_url)
        .send()
        .await
        .map_err(|e| format!("registry unreachable ({}): {}", meta_url, e))?
        .json()
        .await
        .map_err(|e| format!("registry meta parse error: {}", e))?;

    // 2. Download plugin source files
    let manifest_src = client
        .get(&manifest_url)
        .send().await.map_err(|e| format!("download manifest error: {}", e))?
        .text().await.map_err(|e| format!("read manifest error: {}", e))?;

    let main_src = client
        .get(&main_url)
        .send().await.map_err(|e| format!("download main.lua error: {}", e))?
        .text().await.map_err(|e| format!("read main.lua error: {}", e))?;

    // 3. Integrity check BEFORE touching disk
    verify_sha256(&manifest_src, &meta.manifest_sha256, "manifest.lua")?;
    verify_sha256(&main_src,     &meta.main_sha256,     "main.lua")?;

    // 4. Save to user data dir and load
    install_plugin_files(manifest_src, main_src, host).await
}

/// Install a plugin from explicit manifest + main Lua source URLs.
///
/// Security rules:
/// - Production: both URLs must start with `OFFICIAL_REGISTRY` (HTTPS).
/// - Dev mode (`FORJA_DEV_MODE=1`): any HTTPS URL is accepted.
/// - SHA-256 hashes are **always** verified — no bypassing.
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

    let manifest_src = client
        .get(&manifest_url)
        .send().await.map_err(|e| format!("download manifest error: {}", e))?
        .text().await.map_err(|e| format!("read manifest error: {}", e))?;

    let main_src = client
        .get(&main_url)
        .send().await.map_err(|e| format!("download main.lua error: {}", e))?
        .text().await.map_err(|e| format!("read main.lua error: {}", e))?;

    // Hash verification is ALWAYS mandatory, even in dev mode
    verify_sha256(&manifest_src, &manifest_sha256, "manifest.lua")?;
    verify_sha256(&main_src,     &main_sha256,     "main.lua")?;

    install_plugin_files(manifest_src, main_src, host).await
}

/// Return the current registry configuration and security mode as a JSON value.
/// The Extensions UI uses this to display the registry URL and a dev-mode badge.
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

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::plugin::BracketRange;

    // ── plugin_registry_info ─────────────────────────────────────────────────

    /// plugin_registry_info must include the official registry URL.
    #[test]
    fn registry_info_contains_registry_url() {
        let info = plugin_registry_info();
        assert_eq!(info["registry_url"], OFFICIAL_REGISTRY);
    }

    /// Without FORJA_DEV_MODE set, dev_mode should be false.
    #[test]
    fn registry_info_dev_mode_false_without_env_var() {
        std::env::remove_var("FORJA_DEV_MODE");
        let info = plugin_registry_info();
        assert_eq!(info["dev_mode"], false);
        assert!(info["warning"].is_null());
    }

    /// With FORJA_DEV_MODE set, dev_mode should be true and warning populated.
    #[test]
    fn registry_info_dev_mode_true_with_env_var() {
        std::env::set_var("FORJA_DEV_MODE", "1");
        let info = plugin_registry_info();
        assert_eq!(info["dev_mode"], true);
        assert!(!info["warning"].is_null());
        // Cleanup — avoid polluting other tests
        std::env::remove_var("FORJA_DEV_MODE");
    }

    // ── validate_download_url (security) ─────────────────────────────────────

    /// HTTP URLs must be rejected regardless of mode.
    #[test]
    fn validate_url_rejects_http() {
        std::env::remove_var("FORJA_DEV_MODE");
        let result = validate_download_url("http://registry.forja.dev/plugin.lua");
        assert!(result.is_err());
    }

    /// Official registry HTTPS URLs are always allowed.
    #[test]
    fn validate_url_accepts_official_registry() {
        std::env::remove_var("FORJA_DEV_MODE");
        let url = format!("{}/plugins/my-plugin/1.0.0/manifest.lua", OFFICIAL_REGISTRY);
        assert!(validate_download_url(&url).is_ok());
    }

    /// Unofficial HTTPS URLs are rejected in production mode.
    #[test]
    fn validate_url_rejects_unofficial_in_production() {
        std::env::remove_var("FORJA_DEV_MODE");
        let result = validate_download_url("https://raw.githubusercontent.com/user/repo/main.lua");
        assert!(result.is_err());
    }

    // ── byte_ranges_to_utf16 ──────────────────────────────────────────────────

    /// Empty input returns empty output without panicking.
    #[test]
    fn byte_ranges_to_utf16_empty_input() {
        let result = byte_ranges_to_utf16("hello", vec![]);
        assert!(result.is_empty());
    }

    /// For pure ASCII text, byte offsets and UTF-16 offsets are identical.
    #[test]
    fn byte_ranges_to_utf16_ascii_unchanged() {
        let text = "hello world";
        let ranges = vec![BracketRange { start: 1, finish: 5, depth: 0 }];
        let result = byte_ranges_to_utf16(text, ranges);
        assert_eq!(result.len(), 1);
        // ASCII: byte == UTF-16 code unit, so values stay the same
        assert_eq!(result[0].start, 1);
        assert_eq!(result[0].finish, 5);
        assert_eq!(result[0].depth, 0);
    }

    // ── verify_sha256 ─────────────────────────────────────────────────────────

    /// Correct SHA-256 passes verification.
    #[test]
    fn verify_sha256_correct_hash_passes() {
        // SHA-256 of "hello\n" (known value)
        let content = "hello\n";
        let expected = "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03";
        assert!(verify_sha256(content, expected, "test").is_ok());
    }

    /// Wrong SHA-256 returns an Err with descriptive message.
    #[test]
    fn verify_sha256_wrong_hash_errors() {
        let result = verify_sha256("hello\n", "deadbeef", "test-file");
        assert!(result.is_err());
        let msg = result.unwrap_err();
        assert!(msg.contains("integrity check FAILED"));
        assert!(msg.contains("test-file"));
    }
}
