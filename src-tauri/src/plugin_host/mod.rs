pub mod api;
pub mod event_bus;
pub mod manifest;
pub mod permissions;
pub mod runtime;

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::plugin_host::api::themes::ThemeDefinition;
use crate::plugin_host::event_bus::EventPayload;
use crate::plugin_host::manifest::load_manifest;
use crate::plugin_host::runtime::{BracketRange, PluginRuntime};

// ── PluginHost state ──────────────────────────────────────────────────────────

/// Manages all loaded plugin runtimes. Registered as Tauri managed state
/// inside a `Mutex<PluginHost>`.
pub struct PluginHost {
    runtimes: HashMap<String, PluginRuntime>,
}

impl PluginHost {
    pub fn new() -> Self {
        Self {
            runtimes: HashMap::new(),
        }
    }

    /// Load a plugin from its manifest source and main source strings.
    /// Returns the plugin name on success.
    pub fn load(&mut self, manifest_src: &str, main_src: &str) -> Result<String, String> {
        let manifest = load_manifest(manifest_src)?;
        let name = manifest.name.clone();

        let runtime = PluginRuntime::new(manifest, main_src)?;
        self.runtimes.insert(name.clone(), runtime);
        Ok(name)
    }

    /// Remove a loaded plugin.
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

    /// Emit an event to ALL loaded plugins that registered a handler for it.
    /// Returns a list of (plugin_name, new_buffer) for plugins that modified the buffer.
    pub fn emit_event(
        &self,
        event_name: &str,
        payload: EventPayload,
    ) -> Vec<EventResult> {
        self.runtimes
            .values()
            .filter_map(|r| {
                match r.emit_event(event_name, payload.clone()) {
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
                }
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
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventResult {
    pub plugin: String,
    pub buffer: Option<String>,
    pub error: Option<String>,
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Load a plugin from raw manifest + source strings.
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

/// Unload a plugin by name.
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

/// List all currently loaded plugins.
#[tauri::command]
pub fn plugin_list(
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<Vec<PluginInfo>, String> {
    Ok(host
        .lock()
        .map_err(|e| format!("state lock error: {}", e))?
        .list())
}

/// Execute a named command registered by a plugin, optionally with buffer content.
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

/// Emit an editor event to all loaded plugins.
#[tauri::command]
pub fn plugin_emit_event(
    event_name: String,
    text: Option<String>,
    language: Option<String>,
    filepath: Option<String>,
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<Vec<EventResult>, String> {
    let payload = EventPayload {
        text,
        language,
        filepath,
    };
    Ok(host
        .lock()
        .map_err(|e| format!("state lock error: {}", e))?
        .emit_event(&event_name, payload))
}

/// Get all registered themes from all loaded plugins.
#[tauri::command]
pub fn plugin_get_themes(
    host: State<'_, std::sync::Mutex<PluginHost>>,
) -> Result<Vec<ThemeDefinition>, String> {
    Ok(host
        .lock()
        .map_err(|e| format!("state lock error: {}", e))?
        .get_all_themes())
}

/// Run all bracket providers on the given text and return ranges.
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
