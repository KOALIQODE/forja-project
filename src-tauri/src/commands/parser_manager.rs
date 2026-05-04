//! Parser manager commands — download, compile, and repair grammar binaries.
//!
//! Delegates to [`crate::parser::manager::ParserManager`] which handles the full
//! download/compile pipeline. Progress is streamed to the frontend via Tauri events.

use crate::models::parser_info::{DownloadProgress, ParserInfo};
use crate::parser::manager::ParserManager;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn pm_list_parsers(
    state: State<'_, Mutex<ParserManager>>,
) -> Result<Vec<ParserInfo>, String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    Ok(manager.get_all_parsers())
}

#[tauri::command]
pub async fn pm_get_parser_status(
    parser_name: String,
    state: State<'_, Mutex<ParserManager>>,
) -> Result<ParserInfo, String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    manager.get_parser_info(&parser_name)
        .ok_or_else(|| format!("Parser '{}' not found", parser_name))
}

#[tauri::command]
pub async fn pm_download_parser(
    parser_name: String,
    app: AppHandle,
    state: State<'_, Mutex<ParserManager>>,
) -> Result<String, String> {
    let is_installed = {
        let manager = state.lock().map_err(|e| e.to_string())?;
        manager.cache_manager.is_parser_installed(&parser_name)
    };

    if is_installed {
        return Ok(format!("Parser '{}' is already installed", parser_name));
    }

    let _ = app.emit("parser-download-start", &parser_name);
    let manager = ParserManager::new().map_err(|e| e.to_string())?;
    let app_clone = app.clone();
    let parser_name_clone = parser_name.clone();

    let result = manager.ensure_parser_available(
        &parser_name,
        Box::new(move |downloaded, total| {
            let percentage = if total > 0 { (downloaded as f32 / total as f32) * 100.0 } else { 0.0 };
            let progress = DownloadProgress { parser: parser_name_clone.clone(), downloaded, total, percentage, status: "downloading".to_string() };
            let _ = app_clone.emit(&format!("download-{}", parser_name_clone), &progress);
        }),
    ).await;

    match result {
        Ok(path) => { let _ = app.emit("parser-ready", &parser_name); Ok(path.to_string_lossy().to_string()) }
        Err(e) => { let _ = app.emit("parser-error", serde_json::json!({ "parser": parser_name, "error": e.to_string() })); Err(e.to_string()) }
    }
}

#[tauri::command]
pub async fn pm_download_or_compile_parser(
    parser_name: String,
    app: AppHandle,
    state: State<'_, Mutex<ParserManager>>,
) -> Result<String, String> {
    let is_installed = {
        let manager = state.lock().map_err(|e| e.to_string())?;
        manager.cache_manager.is_parser_installed(&parser_name)
    };

    if is_installed {
        let _ = app.emit("parser-ready", &parser_name);
        return Ok(format!("Parser '{}' already available", parser_name));
    }

    let _ = app.emit("parser-compiling", serde_json::json!({ "parser": &parser_name }));
    let manager = ParserManager::new().map_err(|e| e.to_string())?;
    let app_clone = app.clone();
    let parser_name_clone = parser_name.clone();

    let result = manager.ensure_parser_available(
        &parser_name,
        Box::new(move |downloaded, total| {
            let percentage = if total > 0 { (downloaded as f32 / total as f32) * 100.0 } else { 0.0 };
            let progress = DownloadProgress { parser: parser_name_clone.clone(), downloaded, total, percentage, status: "downloading".to_string() };
            let _ = app_clone.emit(&format!("download-{}", parser_name_clone), &progress);
        }),
    ).await;

    match result {
        Ok(path) => { let _ = app.emit("parser-ready", &parser_name); Ok(path.to_string_lossy().to_string()) }
        Err(e) => { let _ = app.emit("parser-error", serde_json::json!({ "parser": parser_name, "error": e.to_string() })); Err(e.to_string()) }
    }
}

/// Re-download highlight queries for a parser (fixes bad/incompatible query files).
#[tauri::command]
pub async fn pm_repair_queries(
    parser_name: String,
    app: AppHandle,
) -> Result<String, String> {
    let manager = ParserManager::new().map_err(|e| e.to_string())?;
    manager.repair_queries(&parser_name).await.map_err(|e| e.to_string())?;
    let _ = app.emit("parser-queries-repaired", &parser_name);
    Ok(format!("Queries repaired for '{}'", parser_name))
}

/// Re-download queries for ALL installed parsers in one call.
#[tauri::command]
pub async fn pm_repair_all_queries(app: AppHandle) -> Result<Vec<String>, String> {
    let manager = ParserManager::new().map_err(|e| e.to_string())?;
    let parsers = manager.get_all_parsers();
    let mut repaired = Vec::new();

    for info in &parsers {
        if info.installed {
            match manager.repair_queries(&info.language).await {
                Ok(()) => {
                    repaired.push(info.language.clone());
                    let _ = app.emit("parser-queries-repaired", &info.language);
                }
                Err(e) => eprintln!("repair_queries failed for {}: {}", info.language, e),
            }
        }
    }

    Ok(repaired)
}
