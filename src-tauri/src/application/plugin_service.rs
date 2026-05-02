//! Plugin use cases — orchestrate Lua plugin loading and installation.
//!
//! ## Use Cases
//! - Load built-in plugins on first run
//! - Scan user plugin directory
//! - Load a plugin from a path or raw source
//! - Install from the official registry (with integrity verification)
//!
//! ## Design Pattern: Application Service + Strategy (security validation)
//! URL validation follows the Strategy pattern — dev mode swaps in a
//! permissive strategy while production enforces strict registry-only policy.
//!
//! Note: The full implementation is in `plugin_host/mod.rs` (bounded context).
//! This module documents the use cases and re-exports the orchestration entry points.

// The plugin_host bounded context owns the full implementation.
// This module acts as a use-case documentation layer.
#[allow(unused_imports)]
pub use crate::plugin_host::{PluginHost, PluginInfo, EventResult};
