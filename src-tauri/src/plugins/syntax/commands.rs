use crate::shared::analyzer::{CodeAnalyzer, CodeBreadcrumb};
use crate::shared::dynamic_parser::{ParserMetadata, REGISTRY};
use crate::shared::models::SyntaxHighlight;
use crate::shared::syntax_highlighter::SyntaxHighlighter;
use lazy_static::lazy_static;
use parking_lot::Mutex;

lazy_static! {
    static ref ANALYZER: Mutex<CodeAnalyzer> =
        Mutex::new(CodeAnalyzer::new().expect("Failed to init analyzer"));
}

#[tauri::command]
pub async fn list_parsers() -> Result<Vec<ParserMetadata>, String> {
    let _ = REGISTRY.get_config_dir(); // Forzamos el uso de config_dir
    let list = REGISTRY.get_metadata_list();
    // Forzamos el uso de is_enabled para cada lenguaje en la lista
    for p in &list {
        let _ = REGISTRY.is_enabled(&p.language);
    }
    Ok(list)
}

#[tauri::command]
pub async fn install_parser(language: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    // Usar el runtime de tauri para no bloquear el hilo principal de la UI
    tauri::async_runtime::spawn_blocking(move || {
        REGISTRY.download_and_install(&language, &app_handle)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn detect_language(file_path: String) -> Result<String, String> {
    let ext = std::path::Path::new(&file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    Ok(match ext {
        "rs" => "rust",
        "js" | "ts" | "jsx" | "tsx" => "javascript",
        "py" => "python",
        "json" => "json",
        "svelte" => "svelte",
        _ => "unknown",
    }
    .to_string())
}

#[tauri::command]
pub async fn get_code_breadcrumb(
    content: String,
    language: String,
    line: usize,
    column: usize,
) -> Result<CodeBreadcrumb, String> {
    let mut analyzer = ANALYZER.lock();
    analyzer
        .get_breadcrumb(&content, &language, line, column)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_syntax(
    content: String,
    language: String,
) -> Result<SyntaxHighlight, String> {
    let mut highlighter = SyntaxHighlighter::new().map_err(|e| e.to_string())?;
    highlighter
        .highlight(&content, &language)
        .map_err(|e| e.to_string())
}
