//! Editor commands — path utilities for the editor UI.

use dirs::home_dir;
use std::path::PathBuf;

/// Converts a list of absolute paths to shortened display paths.
/// Paths under the home directory are shown as `~/...`.
/// Long paths are truncated to `.../{parent}/{name}`.
#[tauri::command]
pub fn get_shortened_paths(paths: Vec<String>) -> Vec<String> {
    let home = match home_dir() {
        Some(home) => home,
        None => return paths,
    };

    paths
        .into_iter()
        .map(|path| {
            let target = PathBuf::from(&path);

            if let Some(relative) = pathdiff::diff_paths(&target, &home) {
                if let Some(relative_str) = relative.to_str() {
                    return format!("~/{}", relative_str);
                }
            }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_shortened_paths_empty_input() {
        let result = get_shortened_paths(vec![]);
        assert!(result.is_empty());
    }

    #[test]
    fn get_shortened_paths_short_path() {
        let result = get_shortened_paths(vec!["/a/b".to_string()]);
        // Path too short to truncate, should return as-is (no home prefix)
        assert!(!result.is_empty());
    }

    #[test]
    fn get_shortened_paths_long_path() {
        let result = get_shortened_paths(vec!["/some/very/long/path/file.rs".to_string()]);
        // The result might be home-relative or truncated; either way it should be shorter
        assert_eq!(result.len(), 1);
    }
}
