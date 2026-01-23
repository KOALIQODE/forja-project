use dirs_next::home_dir;
use std::path::PathBuf;

#[tauri::command]
pub fn get_shortened_paths(paths: Vec<String>) -> Vec<String> {
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
