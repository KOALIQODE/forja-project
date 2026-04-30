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
        include_str!("../../../lua/themes/tokyo-night-dark/manifest.lua"),
        "themes/tokyo-night-dark/theme.lua",
        include_str!("../../../lua/themes/tokyo-night-dark/theme.lua"),
    ),
    (
        "plugins/bracket-pair-colorizer/manifest.lua",
        include_str!("../../../lua/plugins/bracket-pair-colorizer/manifest.lua"),
        "plugins/bracket-pair-colorizer/main.lua",
        include_str!("../../../lua/plugins/bracket-pair-colorizer/main.lua"),
    ),
];

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
            .flat_map(|r| r.run_bracket_providers(text, language).unwrap_or_default())
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

    for (manifest_rel, _, main_rel, _) in BUILTIN_SEED {
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
    Ok(host
        .lock()
        .map_err(|e| format!("state lock error: {}", e))?
        .run_bracket_providers(&text, &language))
}
