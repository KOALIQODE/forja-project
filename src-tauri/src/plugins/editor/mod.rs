use tauri::{plugin::{Builder, TauriPlugin}, Runtime};

mod commands;
mod helpers;

// Lo único público: la función init
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("editor")
        .invoke_handler(tauri::generate_handler![
            commands::get_shortened_paths
        ])
        .build()
}
