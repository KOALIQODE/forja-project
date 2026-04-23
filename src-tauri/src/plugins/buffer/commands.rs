use crate::shared::file_index::FileIndex;
use std::fs;
use std::path::PathBuf;

fn normalize_path(path: &str) -> String {
    let mut normalized = path.replace("\\", "/");
    while normalized.contains("//") {
        normalized = normalized.replace("//", "/");
    }
    normalized
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    let clean_path = normalize_path(&path);
    
    // Indexamos el archivo para tenerlo listo en el cache
    let _handle = FileIndex::get_or_create(&clean_path)
        .map_err(|e| format!("Error al indexar archivo: {}", e))?;
    
    // Leemos el contenido completo para el buffer inicial
    fs::read_to_string(&clean_path)
        .map_err(|e| format!("Failed to read file at {}: {}", clean_path, e))
}

#[tauri::command]
pub async fn get_total_lines(path: String) -> Result<u32, String> {
    let clean_path = normalize_path(&path);
    let handle = FileIndex::get_or_create(&clean_path)
        .map_err(|e| format!("Error al indexar archivo: {}", e))?;
    handle.total_lines().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_file_lines(path: String, start_line: u32, end_line: u32) -> Result<Vec<String>, String> {
    let clean_path = normalize_path(&path);
    let handle = FileIndex::get_or_create(&clean_path)
        .map_err(|e| format!("Error al indexar archivo: {}", e))?;
    handle.read_lines(start_line, end_line).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    let clean_path = normalize_path(&path);
    let target_path = PathBuf::from(&clean_path);
    
    fs::write(&target_path, content)
        .map_err(|e| format!("Failed to write file at {}: {}", clean_path, e))?;
    
    FileIndex::invalidate(&clean_path);
    Ok(())
}
