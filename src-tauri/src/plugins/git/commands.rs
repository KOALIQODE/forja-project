use git2::{BranchType, Repository};

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
pub fn git_ahead_behind(path: String) -> GitStatus {
    // 1. Descubrir repo (más robusto que open)
    let repo = match Repository::discover(&path) {
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
    let (ahead, behind) = repo
        .graph_ahead_behind(local_oid, upstream_oid)
        .unwrap_or_default();

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
pub fn git_status_batch(paths: Vec<String>) -> Vec<GitStatus> {
    paths.into_iter().map(git_ahead_behind).collect()
}

#[tauri::command]
pub fn git_status_single(path: String) -> GitStatus {
    git_ahead_behind(path)
}

#[tauri::command]
pub fn git_branch(path: String) -> Option<String> {
    let repo = Repository::discover(&path).ok()?;
    let head = repo.head().ok()?;
    head.shorthand().map(|s| s.to_string())
}