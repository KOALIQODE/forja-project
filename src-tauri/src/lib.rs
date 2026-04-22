// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;
mod buffer_core; // Declare the new buffer_core module

use commands::{git, path, fs_explorer};
use buffer_core::{
    file_index::FileIndex,
    syntax_highlighter::SyntaxHighlighter,
    file_searcher::{FileSearcher, SearchResult},
    models::SyntaxHighlight
};
use anyhow::Result;
use tauri::{Manager, Emitter};
use notify::{Watcher, RecommendedWatcher, RecursiveMode, Event, Error}; // For file system watching
use std::path::PathBuf; // For path manipulation
use tokio::sync::mpsc; // For sending events from watcher thread to main async context

#[tauri::command]
async fn read_file_lines(path: String, start_line: u32, end_line: u32) -> Result<Vec<String>, String> {
    let file_index = FileIndex::get_or_create(&path)
        .map_err(|e| format!("Failed to get file index: {}", e))?;
    
    file_index.read_lines(start_line, end_line)
        .map_err(|e| format!("Failed to read lines: {}", e))
}

#[tauri::command]
async fn get_total_lines(path: String) -> Result<u32, String> {
    let file_index = FileIndex::get_or_create(&path)
        .map_err(|e| format!("Failed to get file index: {}", e))?;
    
    file_index.total_lines()
        .map_err(|e| format!("Failed to get total lines: {}", e))
}

#[tauri::command]
async fn highlight_syntax(content: String, language: String) -> Result<SyntaxHighlight, String> {
    let mut highlighter = SyntaxHighlighter::new()
        .map_err(|e| format!("Failed to create highlighter: {}", e))?;
    
    highlighter.highlight(&content, &language)
        .map_err(|e| format!("Failed to highlight syntax: {}", e))
}

#[tauri::command]
async fn search_in_file(file_path: String, pattern: String, max_results: usize) -> Result<Vec<SearchResult>, String> {
    FileSearcher::search_in_file(&file_path, &pattern, max_results)
        .map_err(|e| format!("Failed to search in file: {}", e))
}

#[tauri::command]
async fn watch_directory(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(path.clone());
    let window = app_handle.get_webview_window("main").expect("main window not found");

    tokio::spawn(async move {
        let (tx, mut rx) = mpsc::channel(100); 

        let mut watcher = match RecommendedWatcher::new(move |res: Result<Event, Error>| {
            if let Ok(event) = res {
                if event.kind.is_modify() || event.kind.is_create() || event.kind.is_remove() {
                    for path_buf in event.paths {
                        if path_buf.is_file() {
                            if let Some(file_path_str) = path_buf.to_str() {
                                let _ = tx.blocking_send(file_path_str.to_string());
                            }
                        }
                    }
                }
            } else if let Err(e) = res {
                eprintln!("Watcher error: {:?}", e);
            }
        }, notify::Config::default()) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("Failed to create watcher: {}", e);
                return;
            }
        };

        if let Err(e) = watcher.watch(&path_buf, RecursiveMode::NonRecursive) {
            eprintln!("Failed to watch directory: {}", e);
            return;
        }

        while let Some(file_path_str) = rx.recv().await {
            FileIndex::invalidate(&file_path_str);
            let _ = window.emit("file-changed", file_path_str);
        }
    });

    Ok(())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            path::get_shortened_paths,
            path::read_file,
            path::write_file,
            path::list_directory,
            fs_explorer::explore_directory,
            fs_explorer::search_files,
            git::git_status_batch,
            git::git_ahead_behind,
            git::git_branch, // New git command
            git::git_status_single, // New git command
            read_file_lines,
            get_total_lines,
            highlight_syntax,
            search_in_file,
            watch_directory, // New file watching command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
