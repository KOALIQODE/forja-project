// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use dirs_next::home_dir;
use git2::{BranchType, Repository};
use std::path::PathBuf;

#[tauri::command]
fn get_shortened_paths(paths: Vec<String>) -> Vec<String> {
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

#[derive(serde::Serialize)]
pub struct GitStatus {
    pub path: String,
    pub is_repo: bool,
    pub ahead: usize,
    pub behind: usize,
    pub branch: Option<String>,
    pub has_upstream: bool,
}

#[tauri::command]
fn git_ahead_behind(path: String) -> GitStatus {
    // 1. Abrir repo
    let repo = match Repository::open(&path) {
        Ok(r) => r,
        Err(_) => {
            return GitStatus {
                path,
                is_repo: false,
                ahead: 0,
                behind: 0,
                branch: None,
                has_upstream: false,
            };
        }
    };

    // 2. Rama actual
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => {
            return GitStatus {
                path,
                is_repo: true,
                ahead: 0,
                behind: 0,
                branch: None,
                has_upstream: false,
            };
        }
    };

    let branch_name = head.shorthand().map(|s| s.to_string());

    // Detached HEAD
    if !head.is_branch() {
        return GitStatus {
            path,
            is_repo: true,
            ahead: 0,
            behind: 0,
            branch: branch_name,
            has_upstream: false,
        };
    }

    // 3. Rama local
    let local_branch = match repo.find_branch(branch_name.as_ref().unwrap(), BranchType::Local) {
        Ok(b) => b,
        Err(_) => {
            return GitStatus {
                path,
                is_repo: true,
                ahead: 0,
                behind: 0,
                branch: branch_name,
                has_upstream: false,
            };
        }
    };

    // 4. Upstream
    let upstream = match local_branch.upstream() {
        Ok(u) => u,
        Err(_) => {
            return GitStatus {
                path,
                is_repo: true,
                ahead: 0,
                behind: 0,
                branch: branch_name,
                has_upstream: false,
            };
        }
    };

    let local_oid = match local_branch.into_reference().target() {
        Some(oid) => oid,
        None => {
            return GitStatus {
                path,
                is_repo: true,
                ahead: 0,
                behind: 0,
                branch: branch_name,
                has_upstream: false,
            };
        }
    };

    let upstream_oid = match upstream.into_reference().target() {
        Some(oid) => oid,
        None => {
            return GitStatus {
                path,
                is_repo: true,
                ahead: 0,
                behind: 0,
                branch: branch_name,
                has_upstream: false,
            };
        }
    };

    // 5. Calcular ahead / behind
    let (ahead, behind) = match repo.graph_ahead_behind(local_oid, upstream_oid) {
        Ok(r) => r,
        Err(_) => (0, 0),
    };

    GitStatus {
        path,
        is_repo: true,
        ahead,
        behind,
        branch: branch_name,
        has_upstream: true,
    }
}

#[tauri::command]
fn git_status_batch(paths: Vec<String>) -> Vec<GitStatus> {
    paths.into_iter().map(git_ahead_behind).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_shortened_paths,
            git_status_batch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
