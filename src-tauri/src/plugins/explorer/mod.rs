use tauri::{plugin::{Builder, TauriPlugin}, Runtime};

mod commands;
mod helpers;

// Lo único público: la función init
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("explorer")
        .invoke_handler(tauri::generate_handler![
            commands::search_files,
            commands::explore_directory,
            commands::create_file,
            commands::create_directory,
            commands::rename_entry,
            commands::list_directory_from_path // This command was moved from path.rs
        ])
        .build()
}
