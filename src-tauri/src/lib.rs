//! Forja Studio — Tauri Application Entry Point
//!
//! # Architecture: Hexagonal (Ports & Adapters)
//!
//! ```text
//! ┌──────────────────────────────────────────────────────────────┐
//! │                    Svelte Frontend                           │
//! │            invoke("command_name", { ...args })               │
//! └────────────────────────────┬─────────────────────────────────┘
//!                              │ Tauri IPC boundary
//! ┌────────────────────────────▼─────────────────────────────────┐
//! │   commands/          ← Inbound Adapters                      │
//! │   buffer · diff · document · editor · explorer               │
//! │   git · lsp · parser_manager · plugin_host · syntax          │
//! └──────────────────────────┬───────────────────────────────────┘
//!                            │ delegates to
//! ┌──────────────────────────▼───────────────────────────────────┐
//! │   application/       ← Use Cases (orchestration layer)       │
//! │   document_service · parser_service · plugin_service         │
//! └────────┬──────────────────────────────────────┬──────────────┘
//!          │ defines / reads                       │ uses
//! ┌────────▼────────────┐           ┌──────────────▼─────────────┐
//! │   domain/           │           │   infrastructure/           │
//! │   Pure business     │           │   Outbound adapters (I/O)   │
//! │   logic — no I/O    │           │                             │
//! │                     │           │   filesystem/  (mmap index) │
//! │   char_diff         │           │   git/         (git2)       │
//! │   document          │           │   lsp/         (JSON-RPC)   │
//! │   highlight         │           │   parser/      (tree-sitter)│
//! │   language          │           │   plugin/      (Lua runtime)│
//! │   models            │           │   syntax/      (highlights) │
//! │   parser_info       │           └────────────────────────────┘
//! │   plugin            │
//! └─────────────────────┘
//! ```
//!
//! ## Bounded Context
//! `plugin_host/` is a self-contained bounded context that owns the Lua VM
//! lifecycle, security validation, and manifest parsing. Its internal helpers
//! are `pub(crate)` so `commands/plugin_host.rs` can delegate to them.
//!
//! ## Module Map
//!
//! | Module | Role | Status |
//! |--------|------|--------|
//! | `commands/` | `#[tauri::command]` inbound adapters | ✅ Canonical |
//! | `application/` | Use case orchestration | ✅ Canonical |
//! | `domain/` | Pure entities and value objects | ✅ Canonical |
//! | `infrastructure/` | Filesystem, Git, LSP, Parser, Plugin, Syntax | ✅ Canonical |
//! | `plugin_host/` | `PluginHost` aggregator + helpers (bounded context, `mod.rs` not yet split) | ⚠ Migrating |
//! | `plugin_host/manifest.rs` | Shim → `domain::plugin::{PluginManifest, PluginKind}` | ✅ Shim |
//! | `plugin_host/permissions.rs` | Shim → `domain::plugin::{PermissionSet, ALL_PERMISSIONS}` | ✅ Shim |
//! | `plugin_host/event_bus.rs` | Shim → `domain::plugin::{EventKind, EventPayload}` | ✅ Shim |
//! | `plugin_host/runtime.rs` | Shim → `infrastructure::plugin::runtime::PluginRuntime` | ✅ Shim |
//! | `plugin_host/api/themes.rs` | Shim → `infrastructure::plugin::themes::ThemeDefinition` | ✅ Shim |
//! | `parser/` | Shim → `infrastructure::parser` | ✅ Shim |
//! | `models/` | Shim → `domain::parser_info` | ✅ Shim |
//! | `plugins/` | Legacy shims → `commands/` | ⚠ Legacy |
//! | `shared/` | Legacy shims → `infrastructure/` + `domain/` | ⚠ Legacy |
//! | `document/` | Legacy shim → `domain::document` | ⚠ Legacy |
//! | `highlight/` | Legacy shim → `domain::highlight` | ⚠ Legacy |
//! | `language/` | Legacy shim → `domain::language` | ⚠ Legacy |
//!
//! ## State Management
//! Four shared states are registered at startup via `app.manage()`:
//! - [`domain::document::DocumentManager`] — open editor buffers and parse trees
//! - [`infrastructure::lsp::client::LspClientManager`] — active LSP sessions per language
//! - [`plugin_host::PluginHost`] — loaded Lua plugin VMs
//! - [`infrastructure::parser::manager::ParserManager`] — tree-sitter parser cache
#[cfg(target_os = "linux")]
use glib::ObjectExt;
use std::sync::Mutex;
use tauri::Manager;

// ── Canonical hexagonal layers ────────────────────────────────────────────────
mod application;   // Use cases: document_service, parser_service, plugin_service
mod commands;      // Inbound adapters: all #[tauri::command] handlers
mod domain;        // Pure business logic: entities, value objects, no I/O
mod infrastructure; // Outbound adapters: filesystem, git, LSP, parser, plugin, syntax

// ── Bounded contexts ──────────────────────────────────────────────────────────
// plugin_host/ is a self-contained context: Lua VMs, manifest parsing, security.
// Its #[tauri::command]s live in commands/plugin_host.rs; helpers are pub(crate).
mod plugin_host;

// ── Backward-compatibility shims ─────────────────────────────────────────────
// These modules re-export from canonical locations so that legacy `crate::X`
// references throughout the codebase continue to compile without modification.
// They will be removed once all internal references are updated.
mod models;   // shim → crate::domain::parser_info
mod parser;   // shim → crate::infrastructure::parser

// ── Legacy shim modules ───────────────────────────────────────────────────────
// Pre-hexagonal modules kept alive as re-export shims for backward compat.
// These are NOT compiled into any new code — only maintain old `crate::X` paths.
mod plugins;   // shim → commands/
mod shared;    // shim → infrastructure/ + domain/
mod language;  // shim → domain::language
mod deps;      // Dependency management system
// mod trust;      // Trust hub for external sources (disabled; kept for future optional use)

use domain::document::DocumentManager;
use infrastructure::lsp::client::LspClientManager;
use plugin_host::PluginHost;

/// Application entry point. Configures and runs the Tauri runtime.
///
/// Responsibilities:
/// 1. Register shared application state (`app.manage()`).
/// 2. Apply platform-specific WebView tweaks (Linux: disable zoom gesture).
/// 3. Register all `#[tauri::command]` handlers via `generate_handler!`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ── Register shared state ─────────────────────────────────────────
            // Each state is wrapped in Mutex<T> for thread-safe access from
            // async Tauri commands. Commands receive State<'_, Mutex<T>> params.
            app.manage(Mutex::new(DocumentManager::new()));
            app.manage(Mutex::new(LspClientManager::new()));
            app.manage(Mutex::new(PluginHost::new()));
            app.manage(Mutex::new(
                // Use canonical infrastructure path (parser/ shim re-exports this)
                crate::infrastructure::parser::manager::ParserManager::new()
                    .expect("Failed to init ParserManager"),
            ));

            let window = app.get_webview_window("main").unwrap();

            // ── Linux: disable WebKit2GTK pinch-zoom gesture ──────────────────
            // The zoom gesture interferes with the code editor scroll behaviour.
            // Only present on Linux; macOS/Windows handle zoom differently.
            #[cfg(target_os = "linux")]
            {
                window.with_webview(|webview| {
                    let webview = webview.inner();
                    unsafe {
                        if let Some(data) =
                            webview.data::<glib::Object>("wk-view-zoom-gesture")
                        {
                            glib::gobject_ffi::g_signal_handlers_destroy(
                                data.as_ptr().cast(),
                            );
                        }
                    }
                })?;
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // ── Command registry ──────────────────────────────────────────────────
        // Every #[tauri::command] that the Svelte frontend may invoke() MUST
        // be listed here. Missing entries silently fail at runtime.
        .invoke_handler(tauri::generate_handler![
            // Editor
            commands::editor::get_shortened_paths,
            // Buffer
            commands::buffer::read_file,
            commands::buffer::get_total_lines,
            commands::buffer::read_file_lines,
            commands::buffer::write_file,
            // Git
            commands::git::git_ahead_behind,
            commands::git::git_status_batch,
            commands::git::git_status_single,
            commands::git::git_branch,
            commands::git::git_blame,
            // Explorer
            commands::explorer::search_files,
            commands::explorer::search_in_files,
            commands::explorer::get_files_git_status,
            commands::explorer::get_git_statuses_map,
            commands::explorer::get_project_todos,
            commands::explorer::explore_directory,
            commands::explorer::watch_directory,
            commands::explorer::create_file,
            commands::explorer::create_directory,
            commands::explorer::rename_entry,
            commands::explorer::delete_entry,
            commands::explorer::list_directory_from_path,
            // Syntax
            commands::syntax::list_parsers,
            commands::syntax::install_parser,
            commands::syntax::detect_language,
            commands::syntax::is_native_language,
            commands::syntax::get_code_breadcrumb,
            commands::syntax::highlight_syntax,
            commands::syntax::repair_parser_queries,
            // Document
            commands::document::open_document,
            commands::document::apply_text_edit,
            commands::document::get_document_tokens,
            commands::document::close_document,
            // Diff
            commands::diff::get_git_hunks,
            commands::diff::get_file_head_content,
            commands::diff::stage_hunk,
            commands::diff::revert_hunk,
            commands::diff::compute_char_diff,
            commands::diff::compute_hunk_preview,
            // LSP
            commands::lsp::list_lsp_servers,
            commands::lsp::install_lsp_server,
            commands::lsp::lsp_open_document,
            commands::lsp::lsp_change_document,
            commands::lsp::lsp_close_document,
            // Plugin Host
            commands::plugin_host::plugin_preflight,
            commands::plugin_host::plugin_load_builtins,
            commands::plugin_host::plugin_scan_user_plugins,
            commands::plugin_host::plugin_load_from_path,
            commands::plugin_host::plugin_load,
            commands::plugin_host::plugin_unload,
            commands::plugin_host::plugin_list,
            commands::plugin_host::plugin_execute_command,
            commands::plugin_host::plugin_emit_event,
            commands::plugin_host::plugin_get_themes,
            commands::plugin_host::plugin_run_bracket_providers,
            commands::plugin_host::plugin_install_from_registry,
            commands::plugin_host::plugin_install_from_url,
            commands::plugin_host::plugin_registry_info,
            // Parser Manager
            commands::parser_manager::pm_list_parsers,
            commands::parser_manager::pm_get_parser_status,
            commands::parser_manager::pm_download_parser,
            commands::parser_manager::pm_download_or_compile_parser,
            commands::parser_manager::pm_repair_queries,
            commands::parser_manager::pm_repair_all_queries,
            // Deps
            deps::scan_all,
            deps::scan_manifest,
            deps::install_dep,
            deps::start_watcher,
            deps::stop_watcher,
            deps::validate_dependency,
            deps::clone::clone_and_validate,
            deps::clone::save_validated_project,
            deps::clone::install_project_deps,
            deps::clone::cleanup_clone_session,
            // trust::list_trust_entries,
            // trust::add_trust_entry,
            // trust::remove_trust_entry,
            // trust::is_host_trusted,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
