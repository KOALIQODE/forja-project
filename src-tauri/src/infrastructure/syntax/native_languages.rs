//! Native language stubs — all parsing now handled by the dynamic binary system.
#![allow(dead_code)]
//! Native language stubs — kept for API compatibility.
//!
//! All parsing is now handled by the dynamic binary system in [`crate::parser`].
//! These stubs return `None`/`false` to signal that no bundled parsers exist.

use tree_sitter::Language;

/// Returns None — all languages now loaded dynamically.
pub fn get_native_language(_name: &str) -> Option<Language> {
    None
}

/// Returns None — highlight queries now downloaded to disk cache.
pub fn get_native_highlights(_name: &str) -> Option<String> {
    None
}

/// Returns false — no languages are bundled natively anymore.
pub fn is_native(_name: &str) -> bool {
    false
}

/// Empty list — no bundled languages.
pub const NATIVE_LANGUAGES: &[(&str, &str)] = &[];
