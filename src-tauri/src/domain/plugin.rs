//! Pure domain types for the plugin system.
//!
//! No I/O, no mlua, no infrastructure concerns — only plain data structures and
//! business rules for plugins, themes, events and permissions.

use serde::{Deserialize, Serialize};

/// The kind of a plugin — either a code plugin or a visual theme.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PluginKind {
    /// A code plugin that hooks into editor events and exposes commands.
    Plugin,
    /// A visual theme that provides colour tokens.
    Theme,
}

impl std::fmt::Display for PluginKind {
    /// Format as the lowercase string used in `manifest.lua`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PluginKind::Plugin => write!(f, "plugin"),
            PluginKind::Theme => write!(f, "theme"),
        }
    }
}

/// Parsed contents of a plugin's `manifest.lua`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    /// Human-readable identifier for the plugin.
    pub name: String,
    /// SemVer version string (e.g. `"1.0.0"`).
    pub version: String,
    /// Whether this is a code plugin or a theme.
    pub kind: PluginKind,
    /// Permissions declared by the plugin — must all be in [`ALL_PERMISSIONS`].
    pub permissions: Vec<String>,
}

/// All valid permissions a plugin may declare in its manifest.
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

/// Human-readable metadata for a single permission — shown in the consent dialog.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionDetail {
    /// The permission identifier (e.g. `"buffer:read"`).
    pub id: String,
    /// One-line description shown to the user.
    pub description: String,
    /// Subjective risk level: `"low"`, `"medium"`, or `"high"`.
    pub risk: String,
}

/// Return human-readable detail for every permission in `ALL_PERMISSIONS`.
/// Called by the `plugin_preflight` command to populate the consent dialog.
pub fn permission_detail(id: &str) -> PermissionDetail {
    let (description, risk) = match id {
        "buffer:read"      => ("Read the current editor buffer content", "low"),
        "buffer:write"     => ("Modify the current editor buffer content", "medium"),
        "events:on_open"   => ("Run code when a file is opened", "low"),
        "events:on_save"   => ("Run code when a file is saved", "medium"),
        "events:on_change" => ("Run code on every keystroke (may affect performance)", "medium"),
        "decorations:write"=> ("Draw bracket colours and editor decorations", "low"),
        "theme:register"   => ("Register a colour theme", "low"),
        "workspace:read"   => ("Read the workspace root path", "low"),
        other              => (other, "unknown"),
    };
    PermissionDetail {
        id: id.to_string(),
        description: description.to_string(),
        risk: risk.to_string(),
    }
}

/// Pre-flight information returned before loading a plugin — used for the
/// user-facing permission consent dialog.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginPreflightInfo {
    pub name: String,
    pub version: String,
    pub kind: String,
    pub permissions: Vec<PermissionDetail>,
}

/// A validated set of permissions granted to a plugin at load time.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct PermissionSet {
    granted: Vec<String>,
}

impl PermissionSet {
    /// Build a [`PermissionSet`] from a manifest, validating each declared permission.
    ///
    /// Returns `Err` if any permission is not listed in [`ALL_PERMISSIONS`].
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

    /// Returns `true` if `permission` was granted to this plugin.
    #[allow(dead_code)]
    pub fn has(&self, permission: &str) -> bool {
        self.granted.iter().any(|p| p == permission)
    }

    /// Returns `Ok(())` if the permission is granted, otherwise `Err`.
    #[allow(dead_code)]
    pub fn require(&self, permission: &str) -> Result<(), String> {
        if self.has(permission) {
            Ok(())
        } else {
            Err(format!("permission '{}' not declared in plugin manifest", permission))
        }
    }

    /// All granted permission strings as a slice.
    pub fn granted(&self) -> &[String] {
        &self.granted
    }
}

/// A named editor event that a plugin can subscribe to.
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    /// Fired when a file is opened in the editor.
    OnOpen,
    /// Fired when a file is saved.
    OnSave,
    /// Fired when the buffer content changes.
    OnChange,
    /// A custom command event; the inner string is the command name.
    OnCommand(String),
}

impl EventKind {
    /// Parse an [`EventKind`] from its string representation.
    ///
    /// Examples: `"on_open"`, `"on_command:my_cmd"`.
    #[allow(dead_code)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "on_open" => Some(EventKind::OnOpen),
            "on_save" => Some(EventKind::OnSave),
            "on_change" => Some(EventKind::OnChange),
            other if other.starts_with("on_command:") => {
                Some(EventKind::OnCommand(other[11..].to_string()))
            }
            _ => None,
        }
    }

    /// Returns the manifest permission key required to subscribe to this event.
    #[allow(dead_code)]
    pub fn permission_key(&self) -> String {
        match self {
            EventKind::OnOpen => "events:on_open".into(),
            EventKind::OnSave => "events:on_save".into(),
            EventKind::OnChange => "events:on_change".into(),
            EventKind::OnCommand(_) => "events:on_command".into(),
        }
    }

    /// The Lua table key used when registering an event handler.
    #[allow(dead_code)]
    pub fn as_lua_key(&self) -> String {
        match self {
            EventKind::OnOpen => "on_open".into(),
            EventKind::OnSave => "on_save".into(),
            EventKind::OnChange => "on_change".into(),
            EventKind::OnCommand(name) => format!("on_command:{}", name),
        }
    }
}

/// Context payload passed to Lua event handlers.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EventPayload {
    /// Current buffer text, if applicable.
    pub text: Option<String>,
    /// Grammar/language identifier.
    pub language: Option<String>,
    /// Absolute path to the file on disk.
    pub filepath: Option<String>,
}

/// A bracket pair colour range returned by a bracket provider plugin.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BracketRange {
    /// 1-based start index (Lua convention).
    pub start: usize,
    /// 1-based end index (Lua convention).
    pub finish: usize,
    /// Nesting depth (0 = outermost pair).
    pub depth: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plugin_kind_display_plugin() {
        assert_eq!(PluginKind::Plugin.to_string(), "plugin");
    }

    #[test]
    fn plugin_kind_display_theme() {
        assert_eq!(PluginKind::Theme.to_string(), "theme");
    }

    fn valid_manifest() -> PluginManifest {
        PluginManifest {
            name: "test".into(),
            version: "1.0.0".into(),
            kind: PluginKind::Plugin,
            permissions: vec!["buffer:read".into()],
        }
    }

    #[test]
    fn permission_set_from_valid_manifest_ok() {
        let manifest = valid_manifest();
        assert!(PermissionSet::from_manifest(&manifest).is_ok());
    }

    #[test]
    fn permission_set_from_unknown_permission_errors() {
        let manifest = PluginManifest {
            name: "bad".into(),
            version: "1.0.0".into(),
            kind: PluginKind::Plugin,
            permissions: vec!["unknown:perm".into()],
        };
        assert!(PermissionSet::from_manifest(&manifest).is_err());
    }

    #[test]
    fn permission_set_has_and_require() {
        let manifest = valid_manifest();
        let ps = PermissionSet::from_manifest(&manifest).unwrap();
        assert!(ps.has("buffer:read"));
        assert!(!ps.has("buffer:write"));
        assert!(ps.require("buffer:read").is_ok());
        assert!(ps.require("buffer:write").is_err());
    }

    #[test]
    fn event_kind_from_str_on_open() {
        assert_eq!(EventKind::from_str("on_open"), Some(EventKind::OnOpen));
    }

    #[test]
    fn event_kind_from_str_on_command() {
        assert_eq!(
            EventKind::from_str("on_command:foo"),
            Some(EventKind::OnCommand("foo".into()))
        );
    }

    #[test]
    fn event_kind_from_str_unknown_returns_none() {
        assert_eq!(EventKind::from_str("invalid_event"), None);
    }

    #[test]
    fn event_kind_permission_key_on_open() {
        assert_eq!(EventKind::OnOpen.permission_key(), "events:on_open");
    }

    #[test]
    fn bracket_range_fields() {
        let r = BracketRange { start: 1, finish: 10, depth: 0 };
        assert_eq!(r.start, 1);
        assert_eq!(r.finish, 10);
        assert_eq!(r.depth, 0);
    }
}
