// ── Canonical location: crate::infrastructure::plugin::themes ────────────────
pub use crate::infrastructure::plugin::themes::ThemeDefinition;
// Also re-export colour structs that callers may use directly.
#[allow(unused_imports)]
pub use crate::infrastructure::plugin::themes::{ThemeColors, ThemeSyntax};

// SUPERSEDED — original ThemeDefinition moved to crate::infrastructure::plugin::themes
// Keep here as historical reference.
//
// use mlua::prelude::*;
// use serde::{Deserialize, Serialize};
//
// #[derive(Debug, Clone, Serialize, Deserialize, Default)]
// pub struct ThemeColors { ... }
//
// #[derive(Debug, Clone, Serialize, Deserialize, Default)]
// pub struct ThemeSyntax { ... }
//
// #[derive(Debug, Clone, Serialize, Deserialize)]
// pub struct ThemeDefinition { ... }
//
// impl ThemeDefinition {
//     pub fn from_lua_table(table: &LuaTable) -> LuaResult<Self> { ... }
// }

// TESTS MOVED — canonical tests live in `crate::infrastructure::plugin::themes`.
//
// #[cfg(test)]
// mod tests {
//     fn theme_definition_re_exported() { ... }
// }
