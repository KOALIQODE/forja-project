use crate::shared::analyzer::{CodeAnalyzer, CodeBreadcrumb};
use crate::shared::dynamic_parser::{ParserMetadata, REGISTRY};
use crate::shared::models::SyntaxHighlight;
use crate::shared::syntax_highlighter::SyntaxHighlighter;
use lazy_static::lazy_static;
use parking_lot::Mutex;
use tauri::{Manager, Emitter};
use std::time::Duration;
use reqwest;
use thiserror::Error;
use serde::Serialize;

lazy_static! {
    static ref ANALYZER: Mutex<CodeAnalyzer> =
        Mutex::new(CodeAnalyzer::new().expect("Failed to init analyzer"));
}

#[derive(Debug, Error, Serialize)]
#[serde(untagged)]
pub enum ParserError {
    #[error("Failed to get app data directory: {0}")]
    AppDataDirError(String),
    #[error("Failed to create parsers directory: {0}")]
    CreateDirError(String),
    #[error("Failed to download parser: {0}")]
    DownloadError(String),
    #[error("Failed to write parser to disk: {0}")]
    WriteFileError(String),
    #[error("Language not provided")]
    LanguageMissing,
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
pub async fn install_parser(app: tauri::AppHandle, language: String) -> Result<String, ParserError> {
    if language.is_empty() {
        return Err(ParserError::LanguageMissing);
    }

    let _ = app.emit("parser-download-start", &language);

    let data_dir = app.path().app_data_dir()
        .map_err(|e| ParserError::AppDataDirError(format!("Could not determine app data directory: {}", e)))?
        .join("parsers");

    let lang_dir = data_dir.join(&language);
    std::fs::create_dir_all(&lang_dir)
        .map_err(|e| ParserError::CreateDirError(e.to_string()))?;

    let wasm_path = data_dir.join(format!("tree-sitter-{}.wasm", language));
    let queries_path = lang_dir.join("highlights.scm");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Forja-Studio")
        .build()
        .map_err(|e| ParserError::DownloadError(e.to_string()))?;

    // 1. Descargar Wasm si no existe
    if !wasm_path.exists() {
        let _ = app.emit("parser-status", (&language, "Downloading Wasm..."));
        let wasm_url = format!(
            "https://github.com/tree-sitter/tree-sitter-{}/releases/latest/download/tree-sitter-{}.wasm",
            language, language
        );

        let bytes = client.get(&wasm_url).send().await
            .map_err(|e| ParserError::DownloadError(e.to_string()))?
            .bytes().await
            .map_err(|e| ParserError::DownloadError(e.to_string()))?;

        std::fs::write(&wasm_path, &bytes)
            .map_err(|e| ParserError::WriteFileError(e.to_string()))?;
    }

    // 2. Descargar queries (.scm)
    if !queries_path.exists() {
        let _ = app.emit("parser-status", (&language, "Fetching queries..."));
        let scm_url = format!("https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/master/queries/{}/highlights.scm", language);
        
        let scm_res = client.get(&scm_url).send().await;
        match scm_res {
            Ok(res) if res.status().is_success() => {
                let scm_text = res.text().await.map_err(|e| ParserError::DownloadError(e.to_string()))?;
                std::fs::write(&queries_path, scm_text).map_err(|e| ParserError::WriteFileError(e.to_string()))?;
            }
            _ => {
                // Si falla nvim-treesitter, intentamos el repo oficial
                let alt_scm_url = format!("https://raw.githubusercontent.com/tree-sitter/tree-sitter-{}/master/queries/highlights.scm", language);
                if let Ok(res) = client.get(&alt_scm_url).send().await {
                    if res.status().is_success() {
                        let scm_text = res.text().await.map_err(|e| ParserError::DownloadError(e.to_string()))?;
                        std::fs::write(&queries_path, scm_text).map_err(|e| ParserError::WriteFileError(e.to_string()))?;
                    }
                }
            }
        }
    }

    REGISTRY.enabled_languages.write().insert(language.clone());
    let enabled_path = REGISTRY.config_dir.join("enabled_languages.json");
    if let Ok(enabled_json) = serde_json::to_string(&*REGISTRY.enabled_languages.read()) {
        let _ = std::fs::write(enabled_path, enabled_json);
    }

    let _ = app.emit("parser-status", (&language, "Ready"));
    let _ = app.emit("parser-ready", &language);

    Ok(wasm_path.to_string_lossy().to_string())
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
