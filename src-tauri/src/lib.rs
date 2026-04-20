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


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            path::get_shortened_paths,
            path::read_file, // Keep existing read_file for smaller files/direct content
            path::list_directory,
            fs_explorer::explore_directory,
            fs_explorer::search_files,
            git::git_status_batch,
            git::git_ahead_behind,
            read_file_lines,    // New: Efficiently read lines for large files
            get_total_lines,    // New: Get total line count for large files
            highlight_syntax,   // New: Dynamic syntax highlighting
            search_in_file      // New: Efficient file search
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
