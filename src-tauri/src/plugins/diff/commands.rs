// diff/commands.rs — Phase 5 & 6 Tauri commands

use tauri::command;

use super::char_diff::{myers_word_diff, CharSpan};
use super::git_diff::{
    get_file_hunks, get_head_content,
    stage_single_hunk, revert_single_hunk,
    GitHunk,
};

// ── Git diff commands ─────────────────────────────────────────────────────────

/// Returns all git hunks for a file (HEAD → working tree).
///
/// `repo_path`  Any path inside the git repo (used for `Repository::discover`).
/// `file_path`  Absolute path to the file.
#[command]
pub fn get_git_hunks(repo_path: String, file_path: String) -> Result<Vec<GitHunk>, String> {
    get_file_hunks(&repo_path, &file_path)
}

/// Returns the raw HEAD content for a file as a string.
/// The TS side uses this to initialise `BaselineMapManager` with the git baseline.
#[command]
pub fn get_file_head_content(repo_path: String, file_path: String) -> Result<String, String> {
    get_head_content(&repo_path, &file_path)
}

/// Stages a single hunk into the git index.
///
/// `hunk_index`  0-based index into the array returned by `get_git_hunks`.
#[command]
pub fn stage_hunk(
    repo_path:  String,
    file_path:  String,
    hunk_index: usize,
) -> Result<(), String> {
    let hunks = get_file_hunks(&repo_path, &file_path)?;
    let hunk  = hunks.get(hunk_index)
        .ok_or_else(|| format!("Hunk index {} out of range ({})", hunk_index, hunks.len()))?;
    stage_single_hunk(&repo_path, &file_path, hunk)
}

/// Reverts a single hunk in the working tree (discards the change).
///
/// `hunk_index`  0-based index into the array returned by `get_git_hunks`.
#[command]
pub fn revert_hunk(
    repo_path:  String,
    file_path:  String,
    hunk_index: usize,
) -> Result<(), String> {
    let hunks = get_file_hunks(&repo_path, &file_path)?;
    let hunk  = hunks.get(hunk_index)
        .ok_or_else(|| format!("Hunk index {} out of range ({})", hunk_index, hunks.len()))?;
    revert_single_hunk(&repo_path, &file_path, hunk)
}

// ── Char diff command (Phase 6) ───────────────────────────────────────────────

/// Computes a word-level Myers diff between two strings.
/// Returns a list of spans with type "equal" | "insert" | "delete".
/// Used by the hunk preview popup to highlight specific changed words.
#[command]
pub fn compute_char_diff(old_text: String, new_text: String) -> Vec<CharSpan> {
    myers_word_diff(&old_text, &new_text)
}

/// Computes the hunk preview for hunk at `hunk_index` in a file.
/// Combines git hunk data + char diff on each changed line pair for richer output.
#[command]
pub fn compute_hunk_preview(
    repo_path:  String,
    file_path:  String,
    hunk_index: usize,
) -> Result<serde_json::Value, String> {
    let hunks = get_file_hunks(&repo_path, &file_path)?;
    let hunk  = hunks.get(hunk_index)
        .ok_or_else(|| format!("Hunk index {} out of range", hunk_index))?;

    // Collect deleted and inserted lines
    let deleted: Vec<&str> = hunk.lines.iter()
        .filter(|l| l.origin == '-')
        .map(|l| l.content.as_str())
        .collect();
    let inserted: Vec<&str> = hunk.lines.iter()
        .filter(|l| l.origin == '+')
        .map(|l| l.content.as_str())
        .collect();

    // Pair deleted/inserted lines for char diff
    let line_diffs: Vec<serde_json::Value> = deleted.iter().zip(inserted.iter())
        .map(|(old, new)| {
            let spans = myers_word_diff(old, new);
            serde_json::json!({
                "old": old,
                "new": new,
                "spans": spans,
            })
        })
        .collect();

    Ok(serde_json::json!({
        "hunk":       hunk,
        "line_diffs": line_diffs,
    }))
}
