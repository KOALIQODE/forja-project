// use tauri::{plugin::{Builder, TauriPlugin}, Runtime};

mod commands;
mod helpers;

pub use commands::*;

// Lo único público: la función init
// pub fn init<R: Runtime>() -> TauriPlugin<R> {
//     Builder::<R>::new("editor")
//         .invoke_handler(tauri::generate_handler![
//             commands::get_shortened_paths
//         ])
//         .build()
// }
