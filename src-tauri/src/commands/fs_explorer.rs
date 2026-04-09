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

/// Normaliza una ruta para asegurar comparaciones consistentes.
fn normalize_path(path: &Path) -> String {
    // Intentamos obtener la ruta absoluta y la normalizamos a string
    fs::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_string()
}

/// Busca archivos en todo el proyecto de forma recursiva con detección de Git.
#[tauri::command]
pub async fn search_files(path: String, query: String) -> Result<Vec<FileEntry>, String> {
    let target_path = PathBuf::from(&path);
    let query_lower = query.to_lowercase();

    // 1. Obtener estados de Git para el proyecto
    let repo = Repository::discover(&target_path).ok();
    let mut git_statuses = HashMap::new();
    
    if let Some(r) = &repo {
        if let Ok(mut index) = r.index() { let _ = index.read(false); }
        let mut status_opts = StatusOptions::new();
        status_opts.include_untracked(true);
        
        if let Ok(statuses) = r.statuses(Some(&mut status_opts)) {
            // El root del repo para unir las rutas relativas de git2
            let repo_root = r.path().parent().unwrap();
            for entry in statuses.iter() {
                if let Some(p) = entry.path() {
                    let full_path = repo_root.join(p);
                    let status_str = match entry.status() {
                        s if s.is_wt_modified() || s.is_index_modified() => "modified",
                        s if s.is_wt_new() || s.is_index_new() => "added",
                        _ => "untracked",
                    };
                    git_statuses.insert(normalize_path(&full_path), status_str.to_string());
                }
            }
        }
    }

    // 2. Buscar archivos
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
                let normalized_p = normalize_path(p);
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
    if !target_path.exists() { return Err(format!("La ruta no existe: {}", path)); }

    // 1. Obtener estados de Git y propagarlos a los padres
    let repo = Repository::discover(&target_path).ok();
    let mut git_statuses = HashMap::new();

    if let Some(r) = &repo {
        if let Ok(mut index) = r.index() { let _ = index.read(false); }
        let mut status_opts = StatusOptions::new();
        status_opts.include_untracked(true);
        status_opts.renames_head_to_index(true);
        status_opts.show(git2::StatusShow::IndexAndWorkdir);

        if let Ok(statuses) = r.statuses(Some(&mut status_opts)) {
            let repo_root = r.path().parent().unwrap();
            for entry in statuses.iter() {
                if let Some(p) = entry.path() {
                    let full_path = repo_root.join(p);
                    let status_str = match entry.status() {
                        s if s.is_wt_modified() || s.is_index_modified() => "modified",
                        s if s.is_wt_new() || s.is_index_new() => "added",
                        _ => "untracked",
                    };
                    
                    let normalized_full = normalize_path(&full_path);
                    git_statuses.insert(normalized_full, status_str.to_string());
                    
                    // Propagación a padres
                    let mut parent = full_path.parent();
                    while let Some(p_path) = parent {
                        if p_path == repo_root { break; }
                        let normalized_parent = normalize_path(p_path);
                        if !git_statuses.contains_key(&normalized_parent) {
                            git_statuses.insert(normalized_parent, "modified".to_string());
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
            let normalized_p = normalize_path(p);
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

    // 3. Añadir ignorados
    let dir_reader = fs::read_dir(&target_path).map_err(|e| format!("Error leyendo directorio: {}", e))?;
    for entry_result in dir_reader {
        if let Ok(entry) = entry_result {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let normalized_p = normalize_path(&p);
            
            if !entries.iter().any(|e| e.name == name) {
                entries.push(FileEntry {
                    name,
                    path: normalized_p,
                    is_dir: p.is_dir(),
                    is_ignored: true,
                    extension: p.extension().map(|e| e.to_string_lossy().to_string()),
                    git_status: None,
                });
            }
        }
    }

    entries.sort_by(|a, b| if a.is_dir != b.is_dir { b.is_dir.cmp(&a.is_dir) } else { a.name.to_lowercase().cmp(&b.name.to_lowercase()) });
    Ok(entries)
}
