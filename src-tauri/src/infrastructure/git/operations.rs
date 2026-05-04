//! Git diff, staging, and revert operations using `git2`.
//!
//! This module is an outbound adapter in the Hexagonal Architecture.
//! All git I/O is isolated here so the commands layer stays free of git2 details.
//!
//! Key operations:
//! - [`get_file_hunks`]: compute HEAD → working-tree hunks for a file.
//! - [`get_head_content`]: retrieve raw HEAD blob content.
//! - [`stage_single_hunk`]: apply a hunk's patch to the index.
//! - [`revert_single_hunk`]: apply the reversed patch to the working tree.

use git2::{Delta, DiffOptions, Patch, Repository};
use serde::{Deserialize, Serialize};

// ── Public types ──────────────────────────────────────────────────────────────

/// A single line in a git diff hunk.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitDiffLine {
    /// `'+'` added, `'-'` deleted, `' '` context
    pub origin: char,
    pub content: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}

/// A single diff hunk with its lines and metadata.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitHunk {
    /// Stable ID: `"{new_start}-{old_start}-{status}"`
    pub id: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    /// Unified-diff hunk header, e.g. `"@@ -10,4 +10,6 @@ fn foo()"`
    pub header: String,
    pub lines: Vec<GitDiffLine>,
}

// ── GitDiffService ────────────────────────────────────────────────────────────

/// Returns all hunks for `file_path` (absolute) relative to git HEAD.
/// `repo_path` can be any path inside the repo (we use `discover`).
pub fn get_file_hunks(repo_path: &str, file_path: &str) -> Result<Vec<GitHunk>, String> {
    let repo = Repository::discover(repo_path).map_err(|e| e.to_string())?;
    let repo_root = repo.workdir().ok_or("No working directory")?;

    let relative = pathdiff::diff_paths(file_path, repo_root)
        .ok_or("Cannot compute relative path")?;

    let head_commit = repo.head().map_err(|e| e.to_string())?
        .peel_to_commit().map_err(|e| e.to_string())?;
    let head_tree = head_commit.tree().map_err(|e| e.to_string())?;

    let mut opts = DiffOptions::new();
    opts.pathspec(&relative);
    opts.context_lines(3);
    opts.include_untracked(false);

    let diff = repo
        .diff_tree_to_workdir_with_index(Some(&head_tree), Some(&mut opts))
        .map_err(|e| e.to_string())?;

    let mut hunks: Vec<GitHunk> = Vec::new();

    for (delta_idx, _) in diff.deltas().enumerate() {
        if diff.get_delta(delta_idx).map(|d| d.status()) == Some(Delta::Unmodified) {
            continue;
        }
        let patch = Patch::from_diff(&diff, delta_idx).map_err(|e| e.to_string())?;
        let patch = match patch {
            Some(p) => p,
            None    => continue,
        };

        for hunk_idx in 0..patch.num_hunks() {
            let (hunk, hunk_line_count) = patch.hunk(hunk_idx).map_err(|e| e.to_string())?;

            let header = std::str::from_utf8(hunk.header())
                .unwrap_or("")
                .trim_end_matches('\n')
                .to_string();

            let mut diff_lines: Vec<GitDiffLine> = Vec::with_capacity(hunk_line_count);

            for line_idx in 0..hunk_line_count {
                let line = patch.line_in_hunk(hunk_idx, line_idx).map_err(|e| e.to_string())?;
                let origin  = line.origin();
                let content = std::str::from_utf8(line.content())
                    .unwrap_or("")
                    .trim_end_matches('\n')
                    .to_string();
                diff_lines.push(GitDiffLine {
                    origin,
                    content,
                    old_lineno: line.old_lineno(),
                    new_lineno: line.new_lineno(),
                });
            }

            let old_start = hunk.old_start();
            let new_start = hunk.new_start();

            let status = if hunk.old_lines() == 0 {
                "added"
            } else if hunk.new_lines() == 0 {
                "deleted"
            } else {
                "modified"
            };

            hunks.push(GitHunk {
                id:        format!("{}-{}-{}", new_start, old_start, status),
                old_start: old_start.saturating_sub(1),
                old_lines: hunk.old_lines(),
                new_start: new_start.saturating_sub(1),
                new_lines: hunk.new_lines(),
                header,
                lines: diff_lines,
            });
        }
    }

    Ok(hunks)
}

/// Returns the raw HEAD content of a file as a string.
pub fn get_head_content(repo_path: &str, file_path: &str) -> Result<String, String> {
    let repo = Repository::discover(repo_path).map_err(|e| e.to_string())?;
    let repo_root = repo.workdir().ok_or("No working directory")?;

    let relative = pathdiff::diff_paths(file_path, repo_root)
        .ok_or("Cannot compute relative path")?;

    let head = repo.head().map_err(|e| e.to_string())?;
    let commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    let tree   = commit.tree().map_err(|e| e.to_string())?;

    let entry = tree
        .get_path(&relative)
        .map_err(|e| format!("File not in HEAD: {}", e))?;

    let blob = repo
        .find_blob(entry.id())
        .map_err(|e| e.to_string())?;

    std::str::from_utf8(blob.content())
        .map(|s| s.to_string())
        .map_err(|e| e.to_string())
}

// ── Stage / Revert helpers ────────────────────────────────────────────────────

/// Builds a minimal unified-diff patch string for a single hunk.
pub fn build_patch_for_hunk(file_path: &str, hunk: &GitHunk) -> String {
    let rel = std::path::Path::new(file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(file_path);

    let mut patch = format!(
        "--- a/{rel}\n+++ b/{rel}\n{header}\n",
        rel    = rel,
        header = hunk.header,
    );
    for line in &hunk.lines {
        patch.push(line.origin);
        patch.push_str(&line.content);
        patch.push('\n');
    }
    patch
}

/// Stages a single hunk into the git index by applying a patch to the index.
pub fn stage_single_hunk(repo_path: &str, file_path: &str, hunk: &GitHunk) -> Result<(), String> {
    let repo  = Repository::discover(repo_path).map_err(|e| e.to_string())?;
    let patch = build_patch_for_hunk(file_path, hunk);

    let diff = git2::Diff::from_buffer(patch.as_bytes()).map_err(|e| e.to_string())?;

    repo.apply(&diff, git2::ApplyLocation::Index, None)
        .map_err(|e| format!("stage failed: {}", e))
}

/// Reverts a single hunk in the working tree by applying the reverse patch.
pub fn revert_single_hunk(repo_path: &str, file_path: &str, hunk: &GitHunk) -> Result<(), String> {
    let repo = Repository::discover(repo_path).map_err(|e| e.to_string())?;

    let reversed_patch = build_reversed_patch(file_path, hunk);

    let diff = git2::Diff::from_buffer(reversed_patch.as_bytes())
        .map_err(|e| e.to_string())?;

    repo.apply(&diff, git2::ApplyLocation::WorkDir, None)
        .map_err(|e| format!("revert failed: {}", e))
}

fn build_reversed_patch(file_path: &str, hunk: &GitHunk) -> String {
    let rel = std::path::Path::new(file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(file_path);

    let header = reverse_hunk_header(&hunk.header, hunk);

    let mut patch = format!("--- a/{rel}\n+++ b/{rel}\n{header}\n", rel = rel, header = header);
    for line in &hunk.lines {
        let origin = match line.origin {
            '+' => '-',
            '-' => '+',
            c   => c,
        };
        patch.push(origin);
        patch.push_str(&line.content);
        patch.push('\n');
    }
    patch
}

fn reverse_hunk_header(_header: &str, hunk: &GitHunk) -> String {
    format!(
        "@@ -{},{} +{},{} @@",
        hunk.new_start + 1, hunk.new_lines,
        hunk.old_start + 1, hunk.old_lines,
    )
}
