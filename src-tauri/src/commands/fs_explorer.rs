//! FS Explorer Module - Forja Editor
//! 
//! Este módulo proporciona capacidades de exploración del sistema de archivos de alto rendimiento,
//! integrando el respeto a las reglas de `.gitignore` y detección de estados de Git con propagación a padres.

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
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
    /// Estado de Git: 'modified', 'added', 'untracked', 'renamed', 'deleted', o None si no hay cambios.
    pub git_status: Option<String>,
}

/// Busca archivos en todo el proyecto de forma recursiva basándose en un término de búsqueda.
#[tauri::command]
pub async fn search_files(path: String, query: String) -> Result<Vec<FileEntry>, String> {
    let target_path = PathBuf::from(&path);
    let query_lower = query.to_lowercase();

    let walker = WalkBuilder::new(&target_path)
        .standard_filters(true)
        .hidden(false)
        .build();

    let mut results = Vec::new();

    for result in walker {
        if let Ok(entry) = result {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            if !p.is_dir() && name.to_lowercase().contains(&query_lower) {
                results.push(FileEntry {
                    name,
                    path: p.to_string_lossy().to_string(),
                    is_dir: false,
                    is_ignored: false,
                    extension: p.extension().map(|e| e.to_string_lossy().to_string()),
                    git_status: None,
                });
            }
        }
        if results.len() > 50 { break; }
    }

    Ok(results)
}

/// Lista el contenido de un directorio de forma no recursiva (nivel 1).
/// Implementa propagación de estados de Git hacia las carpetas padres.
#[tauri::command]
pub async fn explore_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let target_path = PathBuf::from(&path);
    
    if !target_path.exists() {
        return Err(format!("La ruta no existe: {}", path));
    }

    // 1. Obtener estados de Git y propagarlos a los padres
    let repo = Repository::discover(&target_path).ok();
    let mut git_statuses = HashMap::new();

    if let Some(r) = &repo {
        let mut status_opts = StatusOptions::new();
        status_opts.include_untracked(true);
        status_opts.renames_head_to_index(true);
        status_opts.show(git2::StatusShow::IndexAndWorkdir);

        if let Ok(statuses) = r.statuses(Some(&mut status_opts)) {
            let repo_root = r.path().parent().unwrap();
            
            for entry in statuses.iter() {
                if let Some(p) = entry.path() {
                    let full_path = repo_root.join(p);
                    let status = entry.status();
                    
                    let status_str = if status.is_wt_modified() || status.is_index_modified() {
                        "modified"
                    } else if status.is_wt_new() || status.is_index_new() {
                        "added"
                    } else {
                        "untracked"
                    };
                    
                    // Guardar el status del archivo
                    git_statuses.insert(full_path.to_string_lossy().to_string(), status_str.to_string());

                    // PROPAGACIÓN: Marcar todos los padres como 'modified'
                    let mut parent = full_path.parent();
                    while let Some(p_path) = parent {
                        if p_path == repo_root { break; }
                        let p_str = p_path.to_string_lossy().to_string();
                        
                        // Si ya tiene un status (ej. 'added'), no lo sobrescribimos a menos que sea para subir prioridad
                        if !git_statuses.contains_key(&p_str) {
                            git_statuses.insert(p_str, "modified".to_string());
                        }
                        parent = p_path.parent();
                    }
                }
            }
        }
    }

    // 2. Caminar el directorio respetando gitignore
    let walker = WalkBuilder::new(&target_path)
        .standard_filters(true)
        .hidden(false)
        .max_depth(Some(1))
        .build();

    let mut entries = Vec::new();
    
    for result in walker.skip(1) {
        if let Ok(entry) = result {
            let p = entry.path();
            let abs_path = p.to_string_lossy().to_string();
            
            entries.push(FileEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: abs_path.clone(),
                is_dir: p.is_dir(),
                is_ignored: false,
                extension: p.extension().map(|e| e.to_string_lossy().to_string()),
                git_status: git_statuses.get(&abs_path).cloned(),
            });
        }
    }

    // 3. Añadir ignorados
    let dir_reader = fs::read_dir(&target_path)
        .map_err(|e| format!("Error leyendo directorio: {}", e))?;

    for entry_result in dir_reader {
        if let Ok(entry) = entry_result {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let abs_path = p.to_string_lossy().to_string();
            
            if !entries.iter().any(|e| e.name == name) {
                entries.push(FileEntry {
                    name,
                    path: abs_path.clone(),
                    is_dir: p.is_dir(),
                    is_ignored: true,
                    extension: p.extension().map(|e| e.to_string_lossy().to_string()),
                    git_status: None,
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
