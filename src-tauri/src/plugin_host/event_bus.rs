// ── Canonical location: crate::domain::plugin ────────────────────────────────
#[allow(unused_imports)]
pub use crate::domain::plugin::{EventKind, EventPayload};

// SUPERSEDED — original implementation moved to crate::domain::plugin
// Keep here as historical reference.
//
// #![allow(dead_code)]
// use serde::{Deserialize, Serialize};
//
// #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
// #[serde(rename_all = "snake_case")]
// pub enum EventKind {
//     OnOpen,
//     OnSave,
//     OnChange,
//     OnCommand(String),
// }
//
// impl EventKind {
//     pub fn from_str(s: &str) -> Option<Self> { ... }
//     pub fn permission_key(&self) -> String { ... }
//     pub fn as_lua_key(&self) -> String { ... }
// }
//
// #[derive(Debug, Clone, Default, Serialize, Deserialize)]
// pub struct EventPayload {
//     pub text: Option<String>,
//     pub language: Option<String>,
//     pub filepath: Option<String>,
// }

// TESTS MOVED — canonical tests live in `crate::domain::plugin`.
//
// #[cfg(test)]
// mod tests {
//     fn event_kind_re_exported_from_domain() { ... }
//     fn event_payload_re_exported_from_domain() { ... }
// }
