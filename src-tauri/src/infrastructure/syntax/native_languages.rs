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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_native_language_always_returns_none() {
        assert!(get_native_language("rust").is_none());
        assert!(get_native_language("python").is_none());
        assert!(get_native_language("unknown").is_none());
    }

    #[test]
    fn get_native_highlights_always_returns_none() {
        assert!(get_native_highlights("rust").is_none());
        assert!(get_native_highlights("typescript").is_none());
    }

    #[test]
    fn is_native_always_false() {
        assert!(!is_native("rust"));
        assert!(!is_native("python"));
        assert!(!is_native(""));
    }

    #[test]
    fn native_languages_list_is_empty() {
        assert!(NATIVE_LANGUAGES.is_empty());
    }
}
