//! Git commands — repository status, branch info, and blame.

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

#[derive(serde::Serialize, Clone)]
pub struct BlameLine {
    pub author: String,
    pub date: String,
    pub commit_id: String,
    pub summary: String,
}

/// Formats a Unix timestamp as a human-readable relative string.
pub(crate) fn relative_time(timestamp: i64) -> String {
    let now = chrono::Utc::now().timestamp();
    let diff = now - timestamp;

    match diff {
        d if d < 60          => "just now".to_string(),
        d if d < 3600        => format!("{}m ago", d / 60),
        d if d < 86400       => format!("{}h ago", d / 3600),
        d if d < 86400 * 5   => format!("{}d ago", d / 86400),
        _                    => chrono::DateTime::from_timestamp(timestamp, 0)
                                    .map(|dt| dt.format("%Y-%m-%d").to_string())
                                    .unwrap_or_else(|| "Unknown".to_string()),
    }
}

#[tauri::command]
pub fn git_blame(path: String) -> Result<Vec<BlameLine>, String> {
    let repo = Repository::discover(&path).map_err(|e| e.to_string())?;

    let repo_root = repo.workdir().ok_or("No workdir found")?;
    let relative_path = pathdiff::diff_paths(&path, repo_root).ok_or("Could not compute relative path")?;

    let blame = repo.blame_file(&relative_path, None).map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    for hunk in blame.iter() {
        let commit_id = hunk.final_commit_id();
        let commit = repo.find_commit(commit_id).map_err(|e| e.to_string())?;
        let author = commit.author();
        let author_name = author.name().unwrap_or("Unknown").to_string();
        let time = commit.time();

        let date = relative_time(time.seconds());
        let summary = commit.summary().unwrap_or("").to_string();

        let info = BlameLine {
            author: author_name,
            date,
            commit_id: commit_id.to_string(),
            summary,
        };

        let start_line = hunk.final_start_line();

        if results.len() < start_line + hunk.lines_in_hunk() - 1 {
            results.resize(start_line + hunk.lines_in_hunk() - 1, BlameLine {
                author: "".to_string(),
                date: "".to_string(),
                commit_id: "".to_string(),
                summary: "Not committed yet".to_string(),
            });
        }

        for i in 0..hunk.lines_in_hunk() {
            results[start_line - 1 + i] = info.clone();
        }
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_time_just_now() {
        let now = chrono::Utc::now().timestamp();
        assert_eq!(relative_time(now), "just now");
    }

    #[test]
    fn relative_time_minutes() {
        let now = chrono::Utc::now().timestamp();
        assert!(relative_time(now - 120).contains("m ago"));
    }

    #[test]
    fn relative_time_hours() {
        let now = chrono::Utc::now().timestamp();
        assert!(relative_time(now - 7200).contains("h ago"));
    }

    #[test]
    fn relative_time_old_date() {
        // A timestamp from 2020
        let result = relative_time(1577836800);
        // Should be formatted as a date
        assert!(result.contains("2020") || result.contains('-'));
    }
}
