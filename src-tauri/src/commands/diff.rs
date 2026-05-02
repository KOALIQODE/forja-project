//! Diff commands — git hunk management and character-level diff.
//!
//! Bridges the frontend's diff viewer to the git infrastructure and the
//! Myers word-diff domain logic. Commands here are thin wrappers that
//! validate indices and delegate to the real implementations.

use tauri::command;

use crate::domain::char_diff::{myers_word_diff, CharSpan};
use crate::infrastructure::git::operations::{
    get_file_hunks, get_head_content,
    stage_single_hunk, revert_single_hunk,
    GitHunk,
};

// ── Git diff commands ─────────────────────────────────────────────────────────

/// Returns all git hunks for a file (HEAD → working tree).
#[command]
pub fn get_git_hunks(repo_path: String, file_path: String) -> Result<Vec<GitHunk>, String> {
    get_file_hunks(&repo_path, &file_path)
}

/// Returns the raw HEAD content for a file as a string.
#[command]
pub fn get_file_head_content(repo_path: String, file_path: String) -> Result<String, String> {
    get_head_content(&repo_path, &file_path)
}

/// Stages a single hunk into the git index.
///
/// `hunk_index` is the 0-based index into the array returned by `get_git_hunks`.
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

// ── Char diff command ─────────────────────────────────────────────────────────

/// Computes a word-level Myers diff between two strings.
/// Returns spans with type `"equal"` | `"insert"` | `"delete"`.
#[command]
pub fn compute_char_diff(old_text: String, new_text: String) -> Vec<CharSpan> {
    myers_word_diff(&old_text, &new_text)
}

/// Computes the hunk preview for hunk at `hunk_index` in a file.
#[command]
pub fn compute_hunk_preview(
    repo_path:  String,
    file_path:  String,
    hunk_index: usize,
) -> Result<serde_json::Value, String> {
    let hunks = get_file_hunks(&repo_path, &file_path)?;
    let hunk  = hunks.get(hunk_index)
        .ok_or_else(|| format!("Hunk index {} out of range", hunk_index))?;

    let deleted: Vec<&str> = hunk.lines.iter()
        .filter(|l| l.origin == '-')
        .map(|l| l.content.as_str())
        .collect();
    let inserted: Vec<&str> = hunk.lines.iter()
        .filter(|l| l.origin == '+')
        .map(|l| l.content.as_str())
        .collect();

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_char_diff_equal() {
        let spans = compute_char_diff("hello".into(), "hello".into());
        assert!(spans.iter().all(|s| s.span_type == "equal"));
    }

    #[test]
    fn compute_char_diff_insert() {
        let spans = compute_char_diff("".into(), "world".into());
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].span_type, "insert");
    }
}
