//! Domain layer — pure business logic with no I/O or Tauri dependencies.
//!
//! Hexagonal Architecture: this is the core of the hexagon. All types and logic
//! defined here are free of infrastructure concerns (no filesystem, no HTTP, no IPC).
//! Inbound adapters (`commands/`) call into this layer; outbound adapters
//! (`infrastructure/`) implement ports defined here.

pub mod char_diff;
pub mod document;
pub mod highlight;
pub mod language;
pub mod models;
pub mod parser_info;
pub mod plugin;
