//! Legacy shim — canonical implementation lives in `crate::commands::git`.
#![allow(unused_imports)]
mod commands;
mod helpers;
pub use commands::*;
