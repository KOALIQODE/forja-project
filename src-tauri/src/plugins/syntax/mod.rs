use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

mod commands;

pub use commands::*;

// Added Send + Sync + 'static bounds to R to resolve type mismatch with Wry runtime
#[allow(dead_code)]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("syntax")
        .invoke_handler(tauri::generate_handler![
            // commands::list_parsers,
            // commands::install_parser,
            // commands::detect_language,
            // commands::get_code_breadcrumb,
            // commands::highlight_syntax
        ])
        .build()
}
