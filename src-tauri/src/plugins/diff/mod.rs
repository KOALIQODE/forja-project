//! Legacy shim — canonical implementation lives in `crate::commands::diff`.
#![allow(unused_imports)]
pub mod char_diff;
pub mod commands;
pub mod git_diff;
pub use commands::*;
