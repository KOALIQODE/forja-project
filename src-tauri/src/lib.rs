// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use glib::ObjectExt;
use tauri::{Manager};
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
                        if let Some(data) = webview.data::<glib::Object>("wk-view-zoom-gesture"){
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
        // PERSONAL PLUGINS WITH COMMANDS
        .plugin(plugins::git::init())
        .plugin(plugins::explorer::init())
        .plugin(plugins::editor::init())
        .plugin(plugins::buffer::init())
        .plugin(plugins::syntax::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
