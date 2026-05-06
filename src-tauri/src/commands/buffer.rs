//! Buffer commands — file read/write with mmap-backed line access.
//!
//! These commands form the hot path for the editor's virtual scrolling buffer.
//! `read_file_lines` is called on every scroll event; `write_file` persists saves.

use crate::commands::explorer::register_save;
use crate::infrastructure::filesystem::file_index::FileIndex;
use std::fs;
use std::path::PathBuf;
use tauri::Emitter;

pub(crate) fn normalize_path(path: &str) -> String {
    let mut normalized = path.replace("\\", "/");
    while normalized.contains("//") {
        normalized = normalized.replace("//", "/");
    }
    normalized
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    let clean_path = normalize_path(&path);

    let _handle = FileIndex::get_or_create(&clean_path)
        .map_err(|e| format!("Failed to index file: {}", e))?;

    fs::read_to_string(&clean_path)
        .map_err(|e| format!("Failed to read file at {}: {}", clean_path, e))
}

#[tauri::command]
pub async fn get_total_lines(path: String) -> Result<u32, String> {
    let clean_path = normalize_path(&path);

    FileIndex::invalidate(&clean_path);

    let handle = FileIndex::get_or_create(&clean_path)
        .map_err(|e| format!("Failed to index file: {}", e))?;

    handle.total_lines().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_file_lines(
    path: String,
    start_line: u32,
    end_line: u32,
) -> Result<Vec<String>, String> {
    let clean_path = normalize_path(&path);

    FileIndex::invalidate(&clean_path);

    let handle = FileIndex::get_or_create(&clean_path)
        .map_err(|e| format!("Failed to index file: {}", e))?;

    handle
        .read_lines(start_line, end_line)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_file(
    path: String,
    content: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let clean_path = normalize_path(&path);
    let target_path = PathBuf::from(&clean_path);

    // Register the path BEFORE writing so the watcher skips the resulting OS event.
    register_save(&clean_path);

    fs::write(&target_path, &content)
        .map_err(|e| format!("Failed to write file at {}: {}", clean_path, e))?;

    FileIndex::invalidate(&clean_path);

    app.emit("file-saved", &clean_path)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_path_unix_stays_clean() {
        assert_eq!(normalize_path("/home/user/file.rs"), "/home/user/file.rs");
    }

    #[test]
    fn normalize_path_backslashes_become_forward_slashes() {
        assert_eq!(normalize_path("C:\\Users\\user\\file.rs"), "C:/Users/user/file.rs");
    }

    #[test]
    fn normalize_path_collapses_double_slashes() {
        assert_eq!(normalize_path("/home//user///file.rs"), "/home/user/file.rs");
    }

    #[test]
    fn normalize_path_empty_string_stays_empty() {
        assert_eq!(normalize_path(""), "");
    }

    #[test]
    fn normalize_path_mixed_separators() {
        assert_eq!(normalize_path("C:\\Users//user\\file.rs"), "C:/Users/user/file.rs");
    }
}
