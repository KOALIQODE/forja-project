// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use glib::ObjectExt;
use std::sync::Mutex;
use tauri::Manager;

mod plugins;
mod shared;
mod document;
mod language;
mod highlight;
mod plugin_host;

use document::DocumentManager;
use plugins::lsp::LspClientManager;
use plugin_host::PluginHost;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Register DocumentManager as Tauri-managed state (Phase 1-3)
            app.manage(Mutex::new(DocumentManager::new()));
            // Register LspClientManager as Tauri-managed state
            app.manage(Mutex::new(LspClientManager::new()));
            // Register PluginHost as Tauri-managed state
            app.manage(Mutex::new(PluginHost::new()));

            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "linux")]
            {
                window.with_webview(|webview| {
                    let webview = webview.inner();

                    unsafe {
                        if let Some(data) = webview.data::<glib::Object>("wk-view-zoom-gesture") {
                            glib::gobject_ffi::g_signal_handlers_destroy(data.as_ptr().cast());
                        }
                    }
                })?;
            }

            Ok(())
        })
        // PLUGINS FRAMEWORK TAURI
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // Editor
            plugins::editor::get_shortened_paths,
            // Buffer (stateless file I/O)
            plugins::buffer::read_file,
            plugins::buffer::get_total_lines,
            plugins::buffer::read_file_lines,
            plugins::buffer::write_file,
            // Git
            plugins::git::git_ahead_behind,
            plugins::git::git_status_batch,
            plugins::git::git_status_single,
            plugins::git::git_branch,
            plugins::git::git_blame,
            // Explorer
            plugins::explorer::search_files,
            plugins::explorer::search_in_files,
            plugins::explorer::get_project_todos,
            plugins::explorer::explore_directory,
            plugins::explorer::watch_directory,
            plugins::explorer::create_file,
            plugins::explorer::create_directory,
            plugins::explorer::rename_entry,
            plugins::explorer::delete_entry,
            plugins::explorer::list_directory_from_path,
            // Syntax (WASM-based, stateless)
            plugins::syntax::list_parsers,
            plugins::syntax::install_parser,
            plugins::syntax::detect_language,
            plugins::syntax::is_native_language,
            plugins::syntax::get_code_breadcrumb,
            plugins::syntax::highlight_syntax,
            // Document (Phase 1-3: stateful document management + highlight pipeline)
            plugins::document::open_document,
            plugins::document::apply_text_edit,
            plugins::document::get_document_tokens,
            plugins::document::close_document,
            // Diff (Phase 5-6: git hunks, char diff, stage/revert)
            plugins::diff::get_git_hunks,
            plugins::diff::get_file_head_content,
            plugins::diff::stage_hunk,
            plugins::diff::revert_hunk,
            plugins::diff::compute_char_diff,
            plugins::diff::compute_hunk_preview,
            // LSP (Language Server Protocol)
            plugins::lsp::list_lsp_servers,
            plugins::lsp::install_lsp_server,
            plugins::lsp::lsp_open_document,
            plugins::lsp::lsp_change_document,
            plugins::lsp::lsp_close_document,
            // Plugin Host (Lua runtime)
            plugin_host::plugin_load_builtins,
            plugin_host::plugin_scan_user_plugins,
            plugin_host::plugin_load_from_path,
            plugin_host::plugin_load,
            plugin_host::plugin_unload,
            plugin_host::plugin_list,
            plugin_host::plugin_execute_command,
            plugin_host::plugin_emit_event,
            plugin_host::plugin_get_themes,
            plugin_host::plugin_run_bracket_providers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
