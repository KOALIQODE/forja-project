use tauri::{plugin::{Builder, TauriPlugin}, Runtime};

mod commands;
mod helpers;

// Lo único público: la función init
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("buffer")
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file
        ])
        .build()
}
