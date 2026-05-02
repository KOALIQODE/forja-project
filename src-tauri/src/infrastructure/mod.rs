//! Infrastructure layer — outbound adapters for I/O (filesystem, git, LSP, syntax, parser).
//!
//! Hexagonal Architecture: these are outbound adapters / driven-side adapters.
//! They implement technical concerns that the domain layer depends on via ports.

pub mod filesystem;
pub mod git;
pub mod lsp;
pub mod parser;
pub mod plugin;
pub mod syntax;
