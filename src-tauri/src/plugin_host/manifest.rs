// ── Canonical location: crate::domain::plugin ────────────────────────────────
pub use crate::domain::plugin::{PluginKind, PluginManifest};
// load_manifest stays here — it uses mlua (infrastructure concern)

use mlua::prelude::*;

/// Parse a manifest.lua source string into a [`PluginManifest`].
///
/// Uses a fresh, unrestricted Lua state — manifest parsing is offline, pre-install.
pub fn load_manifest(manifest_src: &str) -> Result<PluginManifest, String> {
    let lua = Lua::new();

    let value: LuaValue = lua
        .load(manifest_src)
        .eval()
        .map_err(|e| format!("manifest eval error: {}", e))?;

    let table = match value {
        LuaValue::Table(t) => t,
        _ => return Err("manifest must return a table".into()),
    };

    let name: String = table
        .get("name")
        .map_err(|_| "manifest missing 'name' field")?;

    let version: String = table
        .get("version")
        .map_err(|_| "manifest missing 'version' field")?;

    let kind_str: String = table
        .get::<Option<String>>("kind")
        .unwrap_or(None)
        .unwrap_or_else(|| "plugin".into());

    let kind = match kind_str.as_str() {
        "theme" => PluginKind::Theme,
        "plugin" | _ => PluginKind::Plugin,
    };

    let permissions: Vec<String> = match table.get::<LuaValue>("permissions") {
        Ok(LuaValue::Table(t)) => t
            .sequence_values::<String>()
            .collect::<LuaResult<Vec<_>>>()
            .map_err(|e| format!("permissions parse error: {}", e))?,
        _ => vec![],
    };

    Ok(PluginManifest {
        name,
        version,
        kind,
        permissions,
    })
}

// SUPERSEDED — original implementation moved to crate::domain::plugin
// Keep here as historical reference.
//
// #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
// #[serde(rename_all = "lowercase")]
// pub enum PluginKind {
//     Plugin,
//     Theme,
// }
//
// impl std::fmt::Display for PluginKind {
//     fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
//         match self {
//             PluginKind::Plugin => write!(f, "plugin"),
//             PluginKind::Theme => write!(f, "theme"),
//         }
//     }
// }
//
// #[derive(Debug, Clone, Serialize, Deserialize)]
// pub struct PluginManifest {
//     pub name: String,
//     pub version: String,
//     pub kind: PluginKind,
//     pub permissions: Vec<String>,
// }

// TESTS MOVED — canonical tests live in `crate::infrastructure::plugin::runtime` and
// `crate::domain::plugin` where the types are actually implemented.
// The tests below are kept as commented reference only.
//
// #[cfg(test)]
// mod tests {
//     use super::*;
//
//     #[test]
//     fn load_manifest_parses_valid_lua() { ... }
//
//     #[test]
//     fn load_manifest_defaults_kind_to_plugin() { ... }
//
//     #[test]
//     fn plugin_kind_re_exported_from_domain() { ... }
// }
