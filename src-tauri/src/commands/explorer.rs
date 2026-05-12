//! Explorer commands — filesystem browsing, file CRUD, directory watching, and text search.
//!
//! Integrates with `.gitignore` rules via the `ignore` crate and propagates git statuses
//! up the directory tree so folders show a "modified" badge when children change.

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
const SAVE_SUPPRESS_SECS: u64 = 3;

/// Paths recently saved by `write_file`, keyed by path → time of registration.
static PENDING_SAVES: LazyLock<Mutex<HashMap<String, Instant>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Called by `write_file` just before writing to disk.
/// Registers the path so the watcher can suppress the resulting OS events.
pub fn register_save(path: &str) {
    if let Ok(mut map) = PENDING_SAVES.lock() {
        map.insert(path.to_string(), Instant::now());
    }
}

/// Represents a filesystem entry (file or directory).
#[derive(Serialize, Debug, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_ignored: bool,
    pub extension: Option<String>,
    pub git_status: Option<String>,
}

fn simplify_path(path: &Path) -> String {
    let s = path.to_string_lossy();
    s.replace("\\", "/")
}

/// Returns git statuses for all files under `path`, propagated to parent dirs.
pub fn get_git_statuses(path: &Path) -> HashMap<String, String> {
    let mut git_statuses = HashMap::new();

    let repo = match Repository::discover(path) {
        Ok(r) => r,
        Err(_) => return git_statuses,
    };

    let mut status_opts = StatusOptions::new();
    status_opts.include_untracked(true);
    status_opts.renames_head_to_index(true);
    status_opts.show(git2::StatusShow::IndexAndWorkdir);

    if let Ok(statuses) = repo.statuses(Some(&mut status_opts)) {
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

#[tauri::command]
pub async fn search_files(path: String, query: String) -> Result<Vec<FileEntry>, String> {
    let target_path = PathBuf::from(&path);
    let query_lower = query.to_lowercase();

    let git_statuses = get_git_statuses(&target_path);

    let walker = WalkBuilder::new(&target_path)
        .standard_filters(true)
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
    let mut seen_paths = std::collections::HashSet::new();

    // First: add entries from WalkBuilder (tracked and standard filters)
    for result in walker.skip(1) {
        if let Ok(entry) = result {
            let p = entry.path();
            let normalized_p = simplify_path(p);
            seen_paths.insert(normalized_p.clone());
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

    // Second: add any remaining untracked files from filesystem that weren't in walker
    let dir_reader =
        fs::read_dir(&target_path).map_err(|e| format!("Error leyendo directorio: {}", e))?;
    for entry_result in dir_reader {
        if let Ok(entry) = entry_result {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let normalized_p = simplify_path(&p);

            if !seen_paths.contains(&normalized_p) {
                let git_status = git_statuses.get(&normalized_p).cloned();
                let is_ignored = !git_status.is_some();
                
                entries.push(FileEntry {
                    name,
                    path: normalized_p,
                    is_dir: p.is_dir(),
                    is_ignored,
                    extension: p.extension().map(|e| e.to_string_lossy().to_string()),
                    git_status,
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

use crate::infrastructure::filesystem::file_searcher::{FileSearcher, SearchResult as TextSearchResult};

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

            if let Ok(matches) = FileSearcher::search_in_file(&p.to_string_lossy(), query, 100) {
                if !matches.is_empty() {
                    results.push(FileContentSearchResult {
                        path: normalized_p,
                        matches,
                    });
                }
            }
        }
        if results.len() > 500 {
            break;
        }
    }

    Ok(results)
}

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
                    if let Ok(mut pending) = PENDING_SAVES.lock() {
                        if let Some(&registered_at) = pending.get(&changed_path) {
                            if registered_at.elapsed() < Duration::from_secs(SAVE_SUPPRESS_SECS) {
                                continue;
                            }
                            pending.remove(&changed_path);
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

#[tauri::command]
pub async fn list_directory_from_path(path: String) -> Result<Vec<FileEntry>, String> {
    let target_path = PathBuf::from(&path);

    let walker = WalkBuilder::new(&target_path)
        .standard_filters(true)
        .hidden(false)
        .max_depth(Some(1))
        .build();

    let mut result = Vec::new();

    for result_entry in walker.skip(1) {
        if let Ok(entry) = result_entry {
            let entry_path = entry.path();
            let normalized_p = simplify_path(entry_path);

            result.push(FileEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: normalized_p.clone(),
                is_dir: entry_path.is_dir(),
                is_ignored: false,
                extension: entry_path
                    .extension()
                    .map(|e| e.to_string_lossy().to_string()),
                git_status: None,
            });
        }
    }

    let dir_reader =
        fs::read_dir(&target_path).map_err(|e| format!("Error leyendo directorio: {}", e))?;
    for entry_result in dir_reader {
        if let Ok(entry) = entry_result {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let normalized_p = simplify_path(&p);

            if result.iter().any(|e| e.name == name) {
                continue;
            }

            result.push(FileEntry {
                name: name.clone(),
                path: normalized_p,
                is_dir: p.is_dir(),
                is_ignored: true,
                extension: p.extension().map(|e| e.to_string_lossy().to_string()),
                git_status: None,
            });
        }
    }

    result.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(result)
}

/// Returns the git status (modified/added/deleted/renamed/untracked) for the given file paths.
/// `project_path` should be any path inside the git repo (used to discover the repo root).
#[tauri::command]
pub fn get_files_git_status(
    project_path: String,
    file_paths: Vec<String>,
) -> HashMap<String, String> {
    let base = PathBuf::from(&project_path);
    let all_statuses = get_git_statuses(&base);

    file_paths
        .into_iter()
        .filter_map(|p| {
            let normalized = simplify_path(&PathBuf::from(&p));
            all_statuses.get(&normalized).map(|s| (p, s.clone()))
        })
        .collect()
}

/// Returns ALL git statuses for all modified files in a project.
/// Used by the frontend to keep git status cache synchronized.
#[tauri::command]
pub fn get_git_statuses_map(path: String) -> HashMap<String, String> {
    let base = PathBuf::from(&path);
    get_git_statuses(&base)
}
