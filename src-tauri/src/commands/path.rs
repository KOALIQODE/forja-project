use crate::buffer_core::file_index::FileIndex;
use dirs_next::home_dir;
use std::fs;
use std::path::PathBuf;
use serde::Serialize;
use ignore::WalkBuilder;

#[derive(Serialize)]
pub struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    is_ignored: bool,
}

#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let target_path = PathBuf::from(&path);
    
    // Crear un constructor de búsqueda que respete .gitignore
    // Usamos el WalkBuilder para que gestione automáticamente los ficheros .gitignore
    // Pero solo queremos el primer nivel (profundidad 1)
    let walker = WalkBuilder::new(&target_path)
        .standard_filters(true) // Respeta .gitignore, .ignore, etc.
        .hidden(false)         // No ocultamos los ficheros ocultos, solo los marcamos como ignorados si toca
        .max_depth(Some(1))
        .build();

    let mut result = Vec::new();
    
    // El Walker también devuelve el directorio raíz, lo saltamos
    for result_entry in walker.skip(1) {
        if let Ok(entry) = result_entry {
            let entry_path = entry.path();
            
            result.push(FileEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry_path.to_string_lossy().to_string(),
                is_dir: entry_path.is_dir(),
                is_ignored: false, // Si el Walker lo encontró con filtros activos, NO está ignorado
            });
        }
    }
    
    // También necesitamos añadir manualmente los archivos que el WalkBuilder ignoró
    let normal_entries = fs::read_dir(&target_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in normal_entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            
            // Si este archivo ya está en el resultado (fue encontrado por el Walker), saltar
            if result.iter().any(|e| e.name == name) {
                continue;
            }

            // Si no estaba en el Walker es porque estaba ignorado por .gitignore o similar
            result.push(FileEntry {
                name: name.clone(),
                path: path.to_string_lossy().to_string(),
                is_dir: path.is_dir(),
                is_ignored: true, // Marcar como ignorado
            });
        }
    }
    
    // Ordenar: Directorios primero, luego archivos, ambos alfabéticamente
    result.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(result)
}

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

#[tauri::command]
pub fn get_shortened_paths(paths: Vec<String>) -> Vec<String> {
    let home = match home_dir() {
        Some(home) => home,
        None => return paths, // Return original paths if home dir not found
    };

    paths
        .into_iter()
        .map(|path| {
            let target = PathBuf::from(&path);

            // Try to get relative path from home
            if let Some(relative) = pathdiff::diff_paths(&target, &home) {
                if let Some(relative_str) = relative.to_str() {
                    return format!("~/{}", relative_str);
                }
            }

            // Fallback: show last 2 parts if path is too long
            let normalized_path = path.replace('\\', "/");
            let parts: Vec<&str> = normalized_path.split('/').collect();
            if parts.len() >= 3 {
                format!(".../{}", parts[parts.len() - 2..].join("/"))
            } else {
                path
            }
        })
        .collect()
}
