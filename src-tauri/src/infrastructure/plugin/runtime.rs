//! Lua VM runtime for a single plugin instance.
//!
//! Each loaded plugin gets its own isolated [`PluginRuntime`] — no shared globals.

use mlua::prelude::*;

use crate::domain::plugin::{BracketRange, EventPayload, PermissionSet, PluginManifest};
use crate::infrastructure::plugin::themes::ThemeDefinition;

/// Maximum memory per plugin VM (8 MB).
const PLUGIN_MEMORY_LIMIT: usize = 8 * 1024 * 1024;

/// A single isolated Lua VM for one plugin.
///
/// Each plugin gets its own `PluginRuntime` — no shared globals between plugins.
pub struct PluginRuntime {
    /// Parsed manifest from `manifest.lua`.
    pub manifest: PluginManifest,
    /// Absolute path to the plugin directory on disk (used for reload/re-enable).
    pub dir_path: Option<String>,
    lua: Lua,
}

impl PluginRuntime {
    /// Create a sandboxed Lua VM, expose the `editor.*` API, and execute plugin source.
    ///
    /// # Errors
    /// Returns `Err` if the manifest declares unknown permissions, or if the Lua
    /// source contains a syntax error or calls an API without the required permission.
    pub fn new(manifest: PluginManifest, source: &str) -> Result<Self, String> {
        let lua = Lua::new();

        // Apply memory limit
        lua.set_memory_limit(PLUGIN_MEMORY_LIMIT)
            .map_err(|e| format!("memory limit error: {}", e))?;

        // ── Sandbox: remove all dangerous globals ──────────────────────────
        {
            let g = lua.globals();
            for name in &["os", "io", "debug", "package", "require",
                          "load", "loadstring", "loadfile", "dofile"] {
                g.set(*name, LuaValue::Nil)
                    .map_err(|e| format!("sandbox error removing '{}': {}", name, e))?;
            }
        }

        // ── Internal storage tables (live inside the Lua VM) ───────────────
        lua.load(r#"
            __forja_commands          = {}
            __forja_event_handlers    = {}
            __forja_themes            = {}
            __forja_bracket_providers = {}
            __forja_buffer            = ""
        "#)
        .exec()
        .map_err(|e| format!("storage init error: {}", e))?;

        // ── Build permission set ───────────────────────────────────────────
        let perms = PermissionSet::from_manifest(&manifest)?;
        let granted: Vec<String> = perms.granted().to_vec();

        // ── editor.command(name, fn) ───────────────────────────────────────
        {
            let cmd_fn = lua
                .create_function(|lua_ctx, (name, func): (String, LuaFunction)| {
                    let commands: LuaTable = lua_ctx.globals().get("__forja_commands")?;
                    commands.set(name, func)?;
                    Ok(())
                })
                .map_err(|e| format!("create editor.command: {}", e))?;

            let editor_table: LuaTable = lua.globals().get("editor").unwrap_or_else(|_| {
                lua.create_table().unwrap()
            });
            editor_table
                .set("command", cmd_fn)
                .map_err(|e| format!("set editor.command: {}", e))?;
            lua.globals()
                .set("editor", editor_table)
                .map_err(|e| format!("set editor global: {}", e))?;
        }

        // ── editor.on_event(event_name, fn) ───────────────────────────────
        {
            let granted_on_event = granted.clone();
            let on_event_fn = lua
                .create_function(move |lua_ctx, (event_name, func): (String, LuaFunction)| {
                    let perm = format!("events:{}", event_name);
                    if !granted_on_event.contains(&perm) {
                        return Err(LuaError::RuntimeError(format!(
                            "permission '{}' not granted",
                            perm
                        )));
                    }
                    let handlers_map: LuaTable =
                        lua_ctx.globals().get("__forja_event_handlers")?;
                    let handler_list: LuaTable =
                        match handlers_map.get::<LuaValue>(event_name.clone())? {
                            LuaValue::Table(t) => t,
                            LuaValue::Nil => {
                                let t = lua_ctx.create_table()?;
                                handlers_map.set(event_name.clone(), t.clone())?;
                                t
                            }
                            _ => {
                                return Err(LuaError::RuntimeError(
                                    "invalid event handler storage".into(),
                                ))
                            }
                        };
                    let len = handler_list.raw_len();
                    handler_list.set(len + 1, func)?;
                    Ok(())
                })
                .map_err(|e| format!("create editor.on_event: {}", e))?;

            let editor_table: LuaTable = lua.globals().get("editor").map_err(|e| e.to_string())?;
            editor_table
                .set("on_event", on_event_fn)
                .map_err(|e| format!("set editor.on_event: {}", e))?;
        }

        // ── editor.get_buffer() ───────────────────────────────────────────
        {
            let granted_get = granted.clone();
            let get_buf_fn = lua
                .create_function(move |lua_ctx, ()| {
                    if !granted_get.contains(&"buffer:read".to_string()) {
                        return Err(LuaError::RuntimeError(
                            "permission 'buffer:read' not granted".into(),
                        ));
                    }
                    let text: String = lua_ctx.globals().get("__forja_buffer")?;
                    Ok(text)
                })
                .map_err(|e| format!("create editor.get_buffer: {}", e))?;

            let editor_table: LuaTable = lua.globals().get("editor").map_err(|e| e.to_string())?;
            editor_table
                .set("get_buffer", get_buf_fn)
                .map_err(|e| format!("set editor.get_buffer: {}", e))?;
        }

        // ── editor.set_buffer(text) ───────────────────────────────────────
        {
            let granted_set = granted.clone();
            let set_buf_fn = lua
                .create_function(move |lua_ctx, text: String| {
                    if !granted_set.contains(&"buffer:write".to_string()) {
                        return Err(LuaError::RuntimeError(
                            "permission 'buffer:write' not granted".into(),
                        ));
                    }
                    lua_ctx.globals().set("__forja_buffer", text)?;
                    Ok(())
                })
                .map_err(|e| format!("create editor.set_buffer: {}", e))?;

            let editor_table: LuaTable = lua.globals().get("editor").map_err(|e| e.to_string())?;
            editor_table
                .set("set_buffer", set_buf_fn)
                .map_err(|e| format!("set editor.set_buffer: {}", e))?;
        }

        // ── editor.register_theme(table) ─────────────────────────────────
        {
            let granted_theme = granted.clone();
            let reg_theme_fn = lua
                .create_function(move |lua_ctx, table: LuaTable| {
                    if !granted_theme.contains(&"theme:register".to_string()) {
                        return Err(LuaError::RuntimeError(
                            "permission 'theme:register' not granted".into(),
                        ));
                    }
                    let theme = ThemeDefinition::from_lua_table(&table)?;
                    let theme_json = serde_json::to_string(&theme)
                        .map_err(|e| LuaError::RuntimeError(e.to_string()))?;

                    let themes_list: LuaTable =
                        lua_ctx.globals().get("__forja_themes")?;
                    let len = themes_list.raw_len();
                    themes_list.set(len + 1, theme_json)?;
                    Ok(())
                })
                .map_err(|e| format!("create editor.register_theme: {}", e))?;

            let editor_table: LuaTable = lua.globals().get("editor").map_err(|e| e.to_string())?;
            editor_table
                .set("register_theme", reg_theme_fn)
                .map_err(|e| format!("set editor.register_theme: {}", e))?;
        }

        // ── editor.register_bracket_provider(fn) ─────────────────────────
        {
            let granted_brackets = granted.clone();
            let reg_bracket_fn = lua
                .create_function(move |lua_ctx, func: LuaFunction| {
                    if !granted_brackets.contains(&"decorations:write".to_string()) {
                        return Err(LuaError::RuntimeError(
                            "permission 'decorations:write' not granted".into(),
                        ));
                    }
                    let providers: LuaTable =
                        lua_ctx.globals().get("__forja_bracket_providers")?;
                    let len = providers.raw_len();
                    providers.set(len + 1, func)?;
                    Ok(())
                })
                .map_err(|e| format!("create editor.register_bracket_provider: {}", e))?;

            let editor_table: LuaTable = lua.globals().get("editor").map_err(|e| e.to_string())?;
            editor_table
                .set("register_bracket_provider", reg_bracket_fn)
                .map_err(|e| format!("set editor.register_bracket_provider: {}", e))?;
        }

        // ── editor.workspace_root() ───────────────────────────────────────
        {
            let granted_ws = granted.clone();
            let ws_root_fn = lua
                .create_function(move |_lua_ctx, ()| {
                    if !granted_ws.contains(&"workspace:read".to_string()) {
                        return Err(LuaError::RuntimeError(
                            "permission 'workspace:read' not granted".into(),
                        ));
                    }
                    // Return the current working directory as the workspace root.
                    // In Tauri desktop apps this is typically the project root.
                    let root = std::env::current_dir()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default();
                    Ok(root)
                })
                .map_err(|e| format!("create editor.workspace_root: {}", e))?;

            let editor_table: LuaTable = lua.globals().get("editor").map_err(|e| e.to_string())?;
            editor_table
                .set("workspace_root", ws_root_fn)
                .map_err(|e| format!("set editor.workspace_root: {}", e))?;
        }

        // ── Execute plugin source ─────────────────────────────────────────
        lua.load(source)
            .set_name(&manifest.name)
            .exec()
            .map_err(|e| format!("plugin load error: {}", e))?;

        Ok(Self { manifest, dir_path: None, lua })
    }

    /// Execute a named command registered by this plugin.
    ///
    /// Returns the new buffer content if the plugin modified it, or `None` if unchanged.
    pub fn execute_command(&self, name: &str, buffer: &str) -> Result<Option<String>, String> {
        let commands: LuaTable = self
            .lua
            .globals()
            .get("__forja_commands")
            .map_err(|e| e.to_string())?;

        let func: LuaValue = commands.get(name).map_err(|e| e.to_string())?;

        match func {
            LuaValue::Function(f) => {
                self.lua
                    .globals()
                    .set("__forja_buffer", buffer)
                    .map_err(|e| e.to_string())?;

                f.call::<()>(()).map_err(|e| format!("command '{}' error: {}", name, e))?;

                let new_buf: String = self
                    .lua
                    .globals()
                    .get("__forja_buffer")
                    .map_err(|e| e.to_string())?;

                if new_buf != buffer {
                    Ok(Some(new_buf))
                } else {
                    Ok(None)
                }
            }
            LuaValue::Nil => Ok(None),
            _ => Err(format!("'{}' is not a function", name)),
        }
    }

    /// Fire an event and run all handlers registered for it.
    ///
    /// Returns new buffer content if any handler modified it.
    pub fn emit_event(&self, event_name: &str, payload: EventPayload) -> Result<Option<String>, String> {
        let handlers_map: LuaTable = self
            .lua
            .globals()
            .get("__forja_event_handlers")
            .map_err(|e| e.to_string())?;

        let handler_list: LuaValue = handlers_map
            .get(event_name)
            .map_err(|e| e.to_string())?;

        let handler_list = match handler_list {
            LuaValue::Table(t) => t,
            _ => return Ok(None),
        };

        if let Some(ref text) = payload.text {
            self.lua
                .globals()
                .set("__forja_buffer", text.as_str())
                .map_err(|e| e.to_string())?;
        }

        let ctx = self.lua.create_table().map_err(|e| e.to_string())?;
        if let Some(ref text) = payload.text {
            ctx.set("text", text.as_str()).map_err(|e| e.to_string())?;
        }
        if let Some(ref lang) = payload.language {
            ctx.set("language", lang.as_str()).map_err(|e| e.to_string())?;
        }
        if let Some(ref path) = payload.filepath {
            ctx.set("filepath", path.as_str()).map_err(|e| e.to_string())?;
        }

        for pair in handler_list.sequence_values::<LuaFunction>() {
            let func = pair.map_err(|e| e.to_string())?;
            func.call::<()>(ctx.clone())
                .map_err(|e| format!("event handler error: {}", e))?;
        }

        let new_buf: String = self
            .lua
            .globals()
            .get("__forja_buffer")
            .map_err(|e| e.to_string())?;

        if payload.text.as_deref() != Some(&new_buf) {
            Ok(Some(new_buf))
        } else {
            Ok(None)
        }
    }

    /// Run all bracket providers registered by this plugin and collect ranges.
    pub fn run_bracket_providers(&self, text: &str, language: &str) -> Result<Vec<BracketRange>, String> {
        let providers: LuaTable = self
            .lua
            .globals()
            .get("__forja_bracket_providers")
            .map_err(|e| e.to_string())?;

        let ctx = self.lua.create_table().map_err(|e| e.to_string())?;
        ctx.set("text", text).map_err(|e| e.to_string())?;
        ctx.set("language", language).map_err(|e| e.to_string())?;

        let mut ranges = Vec::new();
        for pair in providers.sequence_values::<LuaFunction>() {
            let func = pair.map_err(|e| e.to_string())?;
            let result: LuaTable = func
                .call(ctx.clone())
                .map_err(|e| format!("bracket provider error: {}", e))?;

            for entry in result.sequence_values::<LuaTable>() {
                let entry = entry.map_err(|e| e.to_string())?;
                let start: usize = entry.get("start").map_err(|e| e.to_string())?;
                let finish: usize = entry.get("finish").map_err(|e| e.to_string())?;
                let depth: usize = entry.get("depth").map_err(|e| e.to_string())?;
                ranges.push(BracketRange { start, finish, depth });
            }
        }

        Ok(ranges)
    }

    /// List all command names registered by this plugin.
    pub fn list_commands(&self) -> Vec<String> {
        let commands: LuaTable = match self.lua.globals().get("__forja_commands") {
            Ok(t) => t,
            Err(_) => return vec![],
        };
        let mut names = Vec::new();
        for pair in commands.pairs::<String, LuaValue>() {
            if let Ok((k, _)) = pair {
                names.push(k);
            }
        }
        names
    }

    /// Collect all themes registered by this plugin.
    pub fn get_themes(&self) -> Vec<ThemeDefinition> {
        let list: LuaTable = match self.lua.globals().get("__forja_themes") {
            Ok(t) => t,
            Err(_) => return vec![],
        };
        let mut themes = Vec::new();
        for json in list.sequence_values::<String>() {
            if let Ok(json) = json {
                if let Ok(theme) = serde_json::from_str::<ThemeDefinition>(&json) {
                    themes.push(theme);
                }
            }
        }
        themes
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::plugin::{PluginKind, PluginManifest};

    fn minimal_manifest() -> PluginManifest {
        PluginManifest {
            name: "test-plugin".into(),
            version: "0.1.0".into(),
            kind: PluginKind::Plugin,
            permissions: vec![],
        }
    }

    #[test]
    fn plugin_runtime_new_with_empty_source_succeeds() {
        let manifest = minimal_manifest();
        let result = PluginRuntime::new(manifest, "");
        assert!(result.is_ok(), "expected Ok, got: {:?}", result.err());
    }

    #[test]
    fn plugin_runtime_new_with_buffer_read_without_permission_fails() {
        let manifest = minimal_manifest(); // no permissions
        let src = r#"editor.get_buffer()"#;
        let result = PluginRuntime::new(manifest, src);
        assert!(result.is_err(), "expected Err (buffer:read not granted)");
    }

    #[test]
    fn list_commands_returns_empty_on_fresh_plugin() {
        let manifest = minimal_manifest();
        let runtime = PluginRuntime::new(manifest, "").unwrap();
        assert!(runtime.list_commands().is_empty());
    }

    #[test]
    fn execute_command_returns_ok_none_for_unknown_command() {
        let manifest = minimal_manifest();
        let runtime = PluginRuntime::new(manifest, "").unwrap();
        let result = runtime.execute_command("nonexistent_cmd", "some buffer text");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    /// Calling editor.workspace_root() without workspace:read permission must fail.
    #[test]
    fn workspace_root_without_permission_fails() {
        let manifest = minimal_manifest(); // no permissions
        let src = r#"editor.workspace_root()"#;
        let result = PluginRuntime::new(manifest, src);
        assert!(result.is_err(), "expected Err (workspace:read not granted)");
    }

    /// Calling editor.workspace_root() WITH workspace:read permission must succeed.
    #[test]
    fn workspace_root_with_permission_succeeds() {
        let manifest = PluginManifest {
            name: "ws-plugin".into(),
            version: "1.0.0".into(),
            kind: PluginKind::Plugin,
            permissions: vec!["workspace:read".into()],
        };
        let src = r#"local root = editor.workspace_root()"#;
        let result = PluginRuntime::new(manifest, src);
        assert!(result.is_ok(), "expected Ok, got: {:?}", result.err());
    }
}
