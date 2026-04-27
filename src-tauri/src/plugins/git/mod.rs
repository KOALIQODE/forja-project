// use tauri::{plugin::{Builder, TauriPlugin}, Runtime};

mod commands;
mod helpers;

pub use commands::*;

// Lo único público: la función init
// pub fn init<R: Runtime>() -> TauriPlugin<R> {
//     Builder::new("git")
//         .invoke_handler(tauri::generate_handler![
//             commands::git_ahead_behind,
//             commands::git_status_batch,
//             commands::git_status_single,
//             commands::git_branch,
//         ])
//         .build()
// }
