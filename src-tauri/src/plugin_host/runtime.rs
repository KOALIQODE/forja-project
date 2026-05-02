// ── Canonical location: crate::infrastructure::plugin::runtime ───────────────
pub use crate::infrastructure::plugin::runtime::PluginRuntime;
pub use crate::domain::plugin::BracketRange;

// SUPERSEDED — original PluginRuntime implementation moved to
// crate::infrastructure::plugin::runtime
// Keep here as historical reference.
//
// use mlua::prelude::*;
// use serde::{Deserialize, Serialize};
//
// use crate::plugin_host::api::themes::ThemeDefinition;
// use crate::plugin_host::event_bus::EventPayload;
// use crate::plugin_host::manifest::PluginManifest;
// use crate::plugin_host::permissions::PermissionSet;
//
// const PLUGIN_MEMORY_LIMIT: usize = 8 * 1024 * 1024;
//
// #[derive(Debug, Clone, Serialize, Deserialize)]
// pub struct BracketRange {
//     pub start: usize,
//     pub finish: usize,
//     pub depth: usize,
// }
//
// pub struct PluginRuntime { ... }
// impl PluginRuntime { ... }

// TESTS MOVED — canonical tests live in `crate::infrastructure::plugin::runtime`
// and `crate::domain::plugin`.
//
// #[cfg(test)]
// mod tests {
//     fn plugin_runtime_re_exported() { ... }
//     fn bracket_range_re_exported() { ... }
// }
