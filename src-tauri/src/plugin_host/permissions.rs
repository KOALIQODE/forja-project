// ── Canonical location: crate::domain::plugin ────────────────────────────────
#[allow(unused_imports)]
pub use crate::domain::plugin::{ALL_PERMISSIONS, PermissionSet};

// SUPERSEDED — original implementation moved to crate::domain::plugin
// Keep here as historical reference.
//
// use crate::plugin_host::manifest::PluginManifest;
//
// pub const ALL_PERMISSIONS: &[&str] = &[
//     "buffer:read",
//     "buffer:write",
//     "events:on_open",
//     "events:on_save",
//     "events:on_change",
//     "decorations:write",
//     "theme:register",
//     "workspace:read",
// ];
//
// #[derive(Debug, Clone)]
// pub struct PermissionSet {
//     granted: Vec<String>,
// }
//
// impl PermissionSet {
//     pub fn from_manifest(manifest: &PluginManifest) -> Result<Self, String> {
//         for perm in &manifest.permissions {
//             if !ALL_PERMISSIONS.contains(&perm.as_str()) {
//                 return Err(format!("unknown permission '{}' declared in manifest", perm));
//             }
//         }
//         Ok(Self {
//             granted: manifest.permissions.clone(),
//         })
//     }
//
//     pub fn has(&self, permission: &str) -> bool {
//         self.granted.iter().any(|p| p == permission)
//     }
//
//     pub fn require(&self, permission: &str) -> Result<(), String> {
//         if self.has(permission) {
//             Ok(())
//         } else {
//             Err(format!("permission '{}' not declared in plugin manifest", permission))
//         }
//     }
//
//     pub fn granted(&self) -> &[String] {
//         &self.granted
//     }
// }

// TESTS MOVED — canonical tests live in `crate::domain::plugin`.
//
// #[cfg(test)]
// mod tests {
//     fn all_permissions_re_exported() { ... }
//     fn permission_set_re_exported_works() { ... }
// }
