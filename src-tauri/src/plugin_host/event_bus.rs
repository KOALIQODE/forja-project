use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    OnOpen,
    OnSave,
    OnChange,
    OnCommand(String),
}

impl EventKind {
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

    pub fn permission_key(&self) -> String {
        match self {
            EventKind::OnOpen => "events:on_open".into(),
            EventKind::OnSave => "events:on_save".into(),
            EventKind::OnChange => "events:on_change".into(),
            EventKind::OnCommand(_) => "events:on_command".into(),
        }
    }

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
    pub text: Option<String>,
    pub language: Option<String>,
    pub filepath: Option<String>,
}
