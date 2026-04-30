use crate::plugin_host::manifest::PluginManifest;

/// All valid permissions a plugin may request.
pub const ALL_PERMISSIONS: &[&str] = &[
    "buffer:read",
    "buffer:write",
    "events:on_open",
    "events:on_save",
    "events:on_change",
    "decorations:write",
    "theme:register",
    "workspace:read",
];

#[derive(Debug, Clone)]
pub struct PermissionSet {
    granted: Vec<String>,
}

impl PermissionSet {
    /// Build a PermissionSet from a manifest, validating each declared permission.
    pub fn from_manifest(manifest: &PluginManifest) -> Result<Self, String> {
        for perm in &manifest.permissions {
            if !ALL_PERMISSIONS.contains(&perm.as_str()) {
                return Err(format!("unknown permission '{}' declared in manifest", perm));
            }
        }
        Ok(Self {
            granted: manifest.permissions.clone(),
        })
    }

    pub fn has(&self, permission: &str) -> bool {
        self.granted.iter().any(|p| p == permission)
    }

    pub fn require(&self, permission: &str) -> Result<(), String> {
        if self.has(permission) {
            Ok(())
        } else {
            Err(format!("permission '{}' not declared in plugin manifest", permission))
        }
    }

    pub fn granted(&self) -> &[String] {
        &self.granted
    }
}
