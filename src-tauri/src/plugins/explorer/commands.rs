//! FS Explorer Module - Forja Editor
//! 
//! Este módulo proporciona capacidades de exploración del sistema de archivos de alto rendimiento,
//! integrando el respeto a las reglas de `.gitignore` y detección de estados de Git con propagación a padres.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use ignore::WalkBuilder;
use git2::{Repository, StatusOptions};
use std::collections::HashMap;

/// Representa una entrada en el sistema de archivos (archivo o directorio).
#[derive(Serialize, Debug, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_ignored: bool,
    pub extension: Option<String>,
    pub git_status: Option<String>,
}

/// Simplifica una ruta para comparaciones. Evitamos canonicalize() porque añade \?\ en Windows
/// y falla si el archivo no existe.
fn simplify_path(path: &Path) -> String {
    path.to_string_lossy().replace("", "/")
}

/// Obtiene los estados de Git para un directorio dado.
pub fn get_git_statuses(path: &Path) -> HashMap<String, String> {
    let mut git_statuses = HashMap::new();
    
    // Intentar encontrar el repositorio
    let repo = match Repository::discover(path) {
        Ok(r) => r,
        Err(_) => return git_statuses, // No es un repo git
    };
    
    let mut status_opts = StatusOptions::new();
    status_opts.include_untracked(true);
    status_opts.renames_head_to_index(true);
    status_opts.show(git2::StatusShow::IndexAndWorkdir);
    
    if let Ok(statuses) = repo.statuses(Some(&mut status_opts)) {
        // El root del repo para unir las rutas relativas de git2
        // repo.path() suele ser la carpeta .git, tomamos el padre
        if let Some(repo_root) = repo.workdir() {
            for entry in statuses.iter() {
                if let Some(p) = entry.path() {
                    let full_path = repo_root.join(p);
                    let status_str = match entry.status() {
                        s if s.is_wt_modified() || s.is_index_modified() => "modified",
                        s if s.is_wt_new() || s.is_index_new() => "added",
                        s if s.is_wt_renamed() || s.is_index_renamed() => "renamed",
                        s if s.is_wt_deleted() || s.is_index_deleted() => "deleted",
                        _ => "untracked",
                    };
                    
                    let normalized_full = simplify_path(&full_path);
                    git_statuses.insert(normalized_full, status_str.to_string());
                    
                    // Propagación a padres (opcional pero ayuda a ver cambios en carpetas)
                    let mut current = full_path.parent();
                    while let Some(parent) = current {
                        if !parent.starts_with(repo_root) || parent == repo_root { break; }
                        let normalized_parent = simplify_path(parent);
                        if !git_statuses.contains_key(&normalized_parent) {
                            git_statuses.insert(normalized_parent, "modified".to_string());
                        }
                        current = parent.parent();
                    }
                }
            }
        }
    }
    
    git_statuses
}

/// Busca archivos en todo el proyecto de forma recursiva con detección de Git.
#[tauri::command]
pub async fn search_files(path: String, query: String) -> Result<Vec<FileEntry>, String> {
    let target_path = PathBuf::from(&path);
    let query_lower = query.to_lowercase();

    let git_statuses = get_git_statuses(&target_path);

    let walker = WalkBuilder::new(&target_path)
        .standard_filters(true)
        .hidden(false)
        .build();

    let mut results = Vec::new();
    for result in walker {
        if let Ok(entry) = result {
            let p = entry.path();
            if p.is_dir() { continue; }
            
            let name = entry.file_name().to_string_lossy().to_string();
            if name.to_lowercase().contains(&query_lower) {
                let normalized_p = simplify_path(p);
                results.push(FileEntry {
                    name,
                    path: normalized_p.clone(),
                    is_dir: false,
                    is_ignored: false,
                    extension: p.extension().map(|e| e.to_string_lossy().to_string()),
                    git_status: git_statuses.get(&normalized_p).cloned(),
                });
            }
        }
        if results.len() > 50 { break; }
    }

    Ok(results)
}

/// Lista el contenido de un directorio de forma no recursiva (nivel 1).
#[tauri::command]
pub async fn explore_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let target_path = PathBuf::from(&path);
    if !target_path.exists() { 
        return Err(format!("La ruta no existe: {}", path)); 
    }

    let git_statuses = get_git_statuses(&target_path);

    let walker = WalkBuilder::new(&target_path)
        .standard_filters(true)
        .hidden(false)
        .max_depth(Some(1))
        .build();

    let mut entries = Vec::new();
    for result in walker.skip(1) {
        if let Ok(entry) = result {
            let p = entry.path();
            let normalized_p = simplify_path(p);
            entries.push(FileEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: normalized_p.clone(),
                is_dir: p.is_dir(),
                is_ignored: false,
                extension: p.extension().map(|e| e.to_string_lossy().to_string()),
                git_status: git_statuses.get(&normalized_p).cloned(),
            });
        }
    }

    // Añadir ignorados
    let dir_reader = fs::read_dir(&target_path).map_err(|e| format!("Error leyendo directorio: {}", e))?;
    for entry_result in dir_reader {
        if let Ok(entry) = entry_result {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let normalized_p = simplify_path(&p);
            
            if !entries.iter().any(|e| e.name == name) {
                entries.push(FileEntry {
                    name,
                    path: normalized_p,
                    is_dir: p.is_dir(),
                    is_ignored: true,
                    extension: p.extension().map(|e| e.to_string_lossy().to_string()),
                    git_status: None, // No git status info available for ignored files
                });
            }
        }
    }

    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    let target_path = PathBuf::from(&path);
    if target_path.exists() {
        return Err("El archivo ya existe".to_string());
    }
    fs::write(target_path, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    let target_path = PathBuf::from(&path);
    if target_path.exists() {
        return Err("El directorio ya existe".to_string());
    }
    fs::create_dir_all(target_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    let old = PathBuf::from(&old_path);
    let new = PathBuf::from(&new_path);
    if !old.exists() {
        return Err("La ruta de origen no existe".to_string());
    }
    if new.exists() {
        return Err("La ruta de destino ya existe".to_string());
    }
    fs::rename(old, new).map_err(|e| e.to_string())
}

// --- Moved from path.rs ---

#[tauri::command]
pub async fn list_directory_from_path(path: String) -> Result<Vec<FileEntry>, String> {
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
            let normalized_p = simplify_path(entry_path); // Added normalization here
            
            result.push(FileEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: normalized_p.clone(),
                is_dir: entry_path.is_dir(),
                is_ignored: false,
                // Provide default values for fields missing in the original path.rs FileEntry
                extension: entry_path.extension().map(|e| e.to_string_lossy().to_string()),
                git_status: None, // No git status info available at this level from WalkBuilder
            });
        }
    }
    
    // También necesitamos añadir manualmente los archivos que el WalkBuilder ignoró
    let dir_reader = fs::read_dir(&target_path).map_err(|e| format!("Error leyendo directorio: {}", e))?;
    for entry_result in dir_reader {
        if let Ok(entry) = entry_result {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let normalized_p = simplify_path(&p);
            
            // If this file is already in the result (was found by the Walker), skip
            if result.iter().any(|e| e.name == name) {
                continue;
            }

            // If it wasn't in the Walker, it was ignored by .gitignore or similar
            result.push(FileEntry {
                name: name.clone(),
                path: normalized_p,
                is_dir: p.is_dir(),
                is_ignored: true, // Mark as ignored
                // Provide default values for fields missing in the original path.rs FileEntry
                extension: p.extension().map(|e| e.to_string_lossy().to_string()),
                git_status: None, // No git status info available for ignored files
            });
        }
    }
    
    // Order: Directories first, then files, both alphabetically
    result.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(result)
}
