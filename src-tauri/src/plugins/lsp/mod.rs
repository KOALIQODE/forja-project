//! Legacy shim — canonical implementation lives in `crate::commands::lsp` and `crate::infrastructure::lsp`.
#![allow(unused_imports)]
mod commands;
pub mod client;
pub use commands::*;
pub use client::LspClientManager;
