//! Document use cases — orchestrate the document lifecycle.
//!
//! ## Use Cases
//! - Open a document with its parser and highlight query loaded
//! - Apply an incremental text edit
//! - Retrieve syntax-highlighted tokens for a visible range
//! - Close a document and free its resources
//!
//! ## Design Pattern: Application Service + Factory
//! `load_language_and_query` acts as a Factory for the (Language, Query) pair
//! needed to initialize a document's syntax tree.

use tree_sitter::Query;

/// Loads the native tree-sitter Language and compiles its highlight Query.
/// Returns `(None, None)` if the parser is not installed or fails to load.
///
/// This is a Factory method — it encapsulates the multi-step process of:
/// 1. Locating the compiled binary in the cache
/// 2. Dynamically loading the shared library
/// 3. Compiling the highlights.scm query
pub fn load_language_and_query(language: &str) -> (Option<tree_sitter::Language>, Option<Query>) {
    use crate::infrastructure::parser::cache::CacheManager;
    use crate::infrastructure::parser::loader::ParserLoader;

    let cache = match CacheManager::new() {
        Ok(c) => c,
        Err(_) => return (None, None),
    };

    let bin_path = cache.binary_path(language);
    if !bin_path.exists() {
        return (None, None);
    }

    let mut loader = ParserLoader::new();
    let lang = match unsafe { loader.load_language(language, &bin_path) } {
        Ok(l) => l,
        Err(_) => return (None, None),
    };

    let queries_path = cache.queries_path(language);
    let query_opt = if queries_path.exists() {
        std::fs::read_to_string(&queries_path)
            .ok()
            .and_then(|src| Query::new(&lang, &src).ok())
    } else {
        None
    };

    (Some(lang), query_opt)
}
