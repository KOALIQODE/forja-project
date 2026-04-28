// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use glib::ObjectExt;
use tauri::Manager;
mod plugins;
mod shared;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
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
            // Buffer
            plugins::buffer::read_file,
            plugins::buffer::get_total_lines,
            plugins::buffer::read_file_lines,
            plugins::buffer::write_file,
            // Git
            plugins::git::git_ahead_behind,
            plugins::git::git_status_batch,
            plugins::git::git_status_single,
            plugins::git::git_branch,
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
            // Syntax
            plugins::syntax::list_parsers,
            plugins::syntax::install_parser,
            plugins::syntax::detect_language,
            plugins::syntax::get_code_breadcrumb,
            plugins::syntax::highlight_syntax,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
