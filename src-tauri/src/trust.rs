use serde::{Deserialize, Serialize};
use chrono::Utc;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum TrustKind {
    Host,
    Owner,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrustEntry {
    pub id: String,
    pub kind: TrustKind,
    pub value: String,
    pub note: Option<String>,
    pub added_at: String,
}

fn trust_store_path() -> Result<PathBuf, String> {
    let mut dir = dirs::config_dir().ok_or_else(|| "Unable to determine config dir".to_string())?;
    dir.push("forja");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.push("trust-hub.json");
    Ok(dir)
}

fn load_trust_store() -> Result<Vec<TrustEntry>, String> {
    let path = trust_store_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let entries: Vec<TrustEntry> = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(entries)
}

fn save_trust_store(entries: &[TrustEntry]) -> Result<(), String> {
    let path = trust_store_path()?;
    let text = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_trust_entries() -> Result<Vec<TrustEntry>, String> {
    load_trust_store()
}

#[tauri::command]
pub fn add_trust_entry(kind: String, value: String, note: Option<String>) -> Result<TrustEntry, String> {
    let mut entries = load_trust_store()?;
    let kind_parsed = match kind.to_ascii_lowercase().as_str() {
        "host" => TrustKind::Host,
        "owner" => TrustKind::Owner,
        _ => return Err("Unknown trust kind".to_string()),
    };
    let normalized = value.trim().to_string();
    let entry = TrustEntry {
        id: format!("trust-{}", Utc::now().timestamp_millis()),
        kind: kind_parsed,
        value: normalized,
        note,
        added_at: Utc::now().to_rfc3339(),
    };
    entries.push(entry.clone());
    save_trust_store(&entries)?;
    Ok(entry)
}

#[tauri::command]
pub fn remove_trust_entry(id: String) -> Result<(), String> {
    let mut entries = load_trust_store()?;
    let orig = entries.len();
    entries.retain(|e| e.id != id);
    if entries.len() == orig {
        return Err("Entry not found".to_string());
    }
    save_trust_store(&entries)?;
    Ok(())
}

/// Internal helper used by other modules to perform fast trust checks.
pub fn host_trusted(host: &str) -> bool {
    if let Ok(entries) = load_trust_store() {
        let host_lc = host.to_ascii_lowercase();
        for e in entries {
            if let TrustKind::Host = e.kind {
                let v = e.value.to_ascii_lowercase();
                if host_lc == v || host_lc.ends_with(&format!(".{}", v)) {
                    return true;
                }
            }
        }
    }
    false
}

#[tauri::command]
pub fn is_host_trusted(host: String) -> Result<bool, String> {
    Ok(host_trusted(&host))
}
