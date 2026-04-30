use mlua::prelude::*;
use serde::{Deserialize, Serialize};

use crate::plugin_host::api::themes::ThemeDefinition;
use crate::plugin_host::event_bus::EventPayload;
use crate::plugin_host::manifest::PluginManifest;
use crate::plugin_host::permissions::PermissionSet;

/// Maximum memory per plugin VM (8 MB).
const PLUGIN_MEMORY_LIMIT: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BracketRange {
    /// 1-based start index (Lua convention)
    pub start: usize,
    /// 1-based end index (Lua convention)
    pub finish: usize,
    pub depth: usize,
}

/// A single isolated Lua VM for one plugin.
/// Each plugin gets its own `PluginRuntime` — no shared globals.
pub struct PluginRuntime {
    pub manifest: PluginManifest,
    lua: Lua,
}

impl PluginRuntime {
    /// Create a sandboxed Lua VM, expose the `editor.*` API, and execute plugin source.
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
        // Clone the granted list — these vecs are 'static and move into closures
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

        // ── Execute plugin source ─────────────────────────────────────────
        lua.load(source)
            .set_name(&manifest.name)
            .exec()
            .map_err(|e| format!("plugin load error: {}", e))?;

        Ok(Self { manifest, lua })
    }

    // ── Public runtime methods ────────────────────────────────────────────

    /// Execute a named command registered by this plugin.
    /// Returns the new buffer content if the plugin modified it.
    pub fn execute_command(&self, name: &str, buffer: &str) -> Result<Option<String>, String> {
        let commands: LuaTable = self
            .lua
            .globals()
            .get("__forja_commands")
            .map_err(|e| e.to_string())?;

        let func: LuaValue = commands.get(name).map_err(|e| e.to_string())?;

        match func {
            LuaValue::Function(f) => {
                // Inject current buffer
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

        // Inject buffer
        if let Some(ref text) = payload.text {
            self.lua
                .globals()
                .set("__forja_buffer", text.as_str())
                .map_err(|e| e.to_string())?;
        }

        // Build ctx table
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

        // Call each handler in order (serial)
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
