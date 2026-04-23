use crate::shared::file_index::FileIndex;
use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    let target_path = PathBuf::from(&path);
    
    // Safety check: as an editor, we read files requested by the user.
    fs::read_to_string(&target_path)
        .map_err(|e| format!("Failed to read file at {}: {}", path, e))
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    let target_path = PathBuf::from(&path);
    
    fs::write(&target_path, content)
        .map_err(|e| format!("Failed to write file at {}: {}", path, e))?;
    
    FileIndex::invalidate(&path);
    Ok(())
}
