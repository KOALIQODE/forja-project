//! FS Explorer Module - Forja Editor
//!
//! Este módulo proporciona capacidades de exploración del sistema de archivos de alto rendimiento,
//! integrando el respeto a las reglas de `.gitignore` y detección de estados de Git con propagación a padres.

use git2::{Repository, StatusOptions};
use ignore::WalkBuilder;
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebouncedEvent};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
use tauri::Emitter;

/// How long (in seconds) a path registered via `register_save` is considered
/// "ours" and therefore suppressed from re-emitting as a `file-changed` event.
/// The OS can fire 2-3 events per write (MODIFY, CLOSE_WRITE, …) and the
/// debouncer may split them across multiple 300 ms windows, so we need a window
/// wider than one debounce period.
const SAVE_SUPPRESS_SECS: u64 = 3;

/// Paths recently saved by `write_file`, keyed by path → time of registration.
/// The watcher suppresses `file-changed` events for any path whose entry is
/// younger than SAVE_SUPPRESS_SECS instead of consuming a one-shot token.
static PENDING_SAVES: LazyLock<Mutex<HashMap<String, Instant>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Called by `write_file` (buffer plugin) just before writing to disk.
/// Registers the path so the watcher can suppress the resulting OS events.
pub fn register_save(path: &str) {
    if let Ok(mut map) = PENDING_SAVES.lock() {
        map.insert(path.to_string(), Instant::now());
    }
}

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
    let s = path.to_string_lossy();
    // Normalizar barras invertidas de Windows a barras normales
    let normalized = s.replace("\\", "/");

    // Doble comprobación: si la ruta tiene un ratio de barras absurdamente alto, algo falló.
    // Pero con el fix de replace("\\", "/") ya no debería ocurrir.
    normalized
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
                        if !parent.starts_with(repo_root) || parent == repo_root {
                            break;
                        }
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
    let mut seen_paths = std::collections::HashSet::new();

    for result in walker {
        if let Ok(entry) = result {
            let p = entry.path();
            if p.is_dir() {
                continue;
            }

            let normalized_p = simplify_path(p);
            if !seen_paths.insert(normalized_p.clone()) {
                continue;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            if name.to_lowercase().contains(&query_lower) {
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
        if results.len() > 50 {
            break;
        }
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
    let dir_reader =
        fs::read_dir(&target_path).map_err(|e| format!("Error leyendo directorio: {}", e))?;
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

use crate::shared::file_searcher::{FileSearcher, SearchResult as TextSearchResult};

#[derive(Serialize, Debug, Clone)]
pub struct FileContentSearchResult {
    pub path: String,
    pub matches: Vec<TextSearchResult>,
}

#[tauri::command]
pub async fn search_in_files(
    path: String,
    query: String,
) -> Result<Vec<FileContentSearchResult>, String> {
    let target_path = PathBuf::from(&path);
    let walker = WalkBuilder::new(&target_path)
        .standard_filters(true)
        .hidden(false)
        .build();

    let mut results = Vec::new();
    let mut seen_paths = std::collections::HashSet::new();

    for result in walker {
        if let Ok(entry) = result {
            let p = entry.path();
            if p.is_dir() {
                continue;
            }

            let normalized_p = simplify_path(p);
            if !seen_paths.insert(normalized_p.clone()) {
                continue;
            }

            if let Ok(matches) = FileSearcher::search_in_file(&p.to_string_lossy(), &query, 10) {
                if !matches.is_empty() {
                    results.push(FileContentSearchResult {
                        path: normalized_p,
                        matches,
                    });
                }
            }
        }
        if results.len() > 20 {
            break;
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_project_todos(path: String) -> Result<Vec<FileContentSearchResult>, String> {
    let target_path = PathBuf::from(&path);
    let walker = WalkBuilder::new(&target_path)
        .standard_filters(true)
        .hidden(false)
        .build();

    let mut results = Vec::new();
    let mut seen_paths = std::collections::HashSet::new();
    let query = "// TODO:";

    for result in walker {
        if let Ok(entry) = result {
            let p = entry.path();
            if p.is_dir() {
                continue;
            }

            let normalized_p = simplify_path(p);
            if !seen_paths.insert(normalized_p.clone()) {
                continue;
            }

            // Aumentamos el límite de resultados por archivo para los TODOs
            if let Ok(matches) = FileSearcher::search_in_file(&p.to_string_lossy(), query, 100) {
                if !matches.is_empty() {
                    results.push(FileContentSearchResult {
                        path: normalized_p,
                        matches,
                    });
                }
            }
        }
        // No ponemos un límite tan estricto de archivos para los TODOs como en search_in_files
        if results.len() > 500 {
            break;
        }
    }

    Ok(results)
}

// Guardar el watcher en estado global para que no se dropee
static WATCHER: Mutex<Option<notify_debouncer_mini::Debouncer<RecommendedWatcher>>> =
    Mutex::new(None);

#[tauri::command]
pub async fn watch_directory(path: String, app: tauri::AppHandle) -> Result<(), String> {
    let watch_path = path.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        move |res: Result<Vec<DebouncedEvent>, _>| {
            if let Ok(events) = res {
                for event in events {
                    let changed_path = simplify_path(&event.path);
                    // Suppress events caused by our own `write_file` saves.
                    // Use a time-window (not a one-shot token) so that multiple
                    // OS events emitted for the same write (MODIFY + CLOSE_WRITE
                    // can arrive in separate debounce windows) are all suppressed.
                    if let Ok(mut pending) = PENDING_SAVES.lock() {
                        if let Some(&registered_at) = pending.get(&changed_path) {
                            if registered_at.elapsed() < Duration::from_secs(SAVE_SUPPRESS_SECS) {
                                continue; // still within our save window — skip
                            }
                            pending.remove(&changed_path); // window expired, clean up
                        }
                    }
                    app.emit("file-changed", &changed_path).ok();
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watcher()
        .watch(std::path::Path::new(&watch_path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Guardar el watcher para que no se dropee
    let mut guard = WATCHER.lock().unwrap();
    *guard = Some(debouncer);

    Ok(())
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

#[tauri::command]
pub async fn delete_entry(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err("La ruta no existe".to_string());
    }
    if target.is_dir() {
        fs::remove_dir_all(target).map_err(|e| e.to_string())
    } else {
        fs::remove_file(target).map_err(|e| e.to_string())
    }
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
        .hidden(false) // No ocultamos los ficheros ocultos, solo los marcamos como ignorados si toca
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
                extension: entry_path
                    .extension()
                    .map(|e| e.to_string_lossy().to_string()),
                git_status: None, // No git status info available at this level from WalkBuilder
            });
        }
    }

    // También necesitamos añadir manualmente los archivos que el WalkBuilder ignoró
    let dir_reader =
        fs::read_dir(&target_path).map_err(|e| format!("Error leyendo directorio: {}", e))?;
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
