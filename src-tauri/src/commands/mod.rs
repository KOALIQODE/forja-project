//! Commands layer — inbound adapters (Tauri IPC boundary).
//!
//! Hexagonal Architecture: these are inbound adapters / driving-side adapters.
//! Each module exposes `#[tauri::command]` functions called from the frontend via `invoke()`.
//! Commands translate Tauri-specific types (State, AppHandle) into domain/infrastructure calls.

pub mod buffer;
pub mod diff;
pub mod document;
pub mod editor;
pub mod explorer;
pub mod git;
pub mod lsp;
pub mod parser_manager;
pub mod plugin_host;
pub mod security;
pub mod syntax;
