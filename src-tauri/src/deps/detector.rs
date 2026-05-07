use std::path::{Path, PathBuf};
use crate::deps::ecosystems::EcosystemHandler;

/// Recorre el filesystem desde `root` y retorna todos los manifiestos encontrados
/// junto con el nombre del ecosistema que los reconoce
pub fn detect_all_manifests(
    root: &Path,
    handlers: &[Box<dyn EcosystemHandler>],
) -> Vec<(PathBuf, String)> {
    let mut results = Vec::new();
    scan_dir(root, handlers, &mut results, 0);
    results
}

fn scan_dir(
    dir: &Path,
    handlers: &[Box<dyn EcosystemHandler>],
    results: &mut Vec<(PathBuf, String)>,
    depth: u8,
) {
    if depth > 8 { return; }
    let Ok(entries) = std::fs::read_dir(dir) else { return };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            // Excluir directorios que nunca contienen manifiestos de proyecto
            if matches!(name.as_str(),
                "node_modules" | "target" | ".git" | "dist" | ".svelte-kit" |
                "__pycache__" | ".venv" | "venv" | "env" | ".env" |
                "vendor" | ".gradle" | "build" | ".build" | "bin" | "obj" |
                ".cargo" | "coverage" | ".nyc_output" | "tmp" | ".tmp"
            ) { continue; }
            scan_dir(&path, handlers, results, depth + 1);
        } else {
            for handler in handlers {
                if handler.is_manifest(&path) {
                    results.push((path.clone(), handler.name().to_string()));
                    break; // un manifiesto → un handler
                }
            }
        }
    }
}
