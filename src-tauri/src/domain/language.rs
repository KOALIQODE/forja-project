//! Language domain scaffold — future native multi-language registry.
//!
//! Currently unused — the project loads languages via WASM (`infrastructure::syntax::dynamic_parser`).
//! These structs will replace `dynamic_parser` once native parsers are packaged as pre-compiled
//! shared libraries for each platform.
//!
//! All items are intentionally kept despite being dead code as a design scaffold (Phase 6).
#![allow(dead_code)]

use tree_sitter::{Language, Parser, Query};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use lazy_static::lazy_static;

pub type LanguageId = String;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LanguageQueryPaths {
    pub highlights: PathBuf,
    pub injections: Option<PathBuf>,
    pub folds: Option<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LanguageDefinition {
    pub id: LanguageId,
    pub name: String,
    pub file_types: Vec<String>,
    pub scope: String,
    pub parser_name: String,
    pub parser_path: PathBuf,
    pub query_paths: LanguageQueryPaths,
}

/// Represents a language ready for use, containing its parser, compiled queries, and metadata.
pub struct LanguageRuntime {
    pub id: LanguageId,
    pub parser: Parser,
    pub language: Language,
    pub highlight_query: Option<String>,
    pub definition: LanguageDefinition,
}

impl LanguageRuntime {
    pub fn new(id: LanguageId, language: Language, parser: Parser, definition: LanguageDefinition) -> Self {
        LanguageRuntime {
            id,
            parser,
            language,
            highlight_query: None,
            definition,
        }
    }

    /// Initializes a Tree-sitter parser with the given language.
    pub fn create_parser(language: Language) -> Result<Parser, String> {
        let mut parser = Parser::new();
        parser.set_language(&language)
            .map_err(|e| format!("Failed to set Tree-sitter language: {}", e))?;
        Ok(parser)
    }

    /// Reads a Tree-sitter query source from a file path.
    pub fn load_query_source(path: &PathBuf) -> Result<String, String> {
        std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read query file {:?}: {}", path, e))
    }

    /// Compiles a Tree-sitter query from a file path.
    pub fn load_query(path: &PathBuf, language: &Language) -> Result<Query, String> {
        let query_source = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read query file {:?}: {}", path, e))?;
        Query::new(language, &query_source)
            .map_err(|e| format!("Failed to compile query from {:?}: {}", path, e))
    }
}

pub struct LanguageRegistry {
    definitions: HashMap<LanguageId, LanguageDefinition>,
    file_type_map: HashMap<String, LanguageId>,
    runtimes_cache: Mutex<HashMap<LanguageId, Arc<LanguageRuntime>>>,
}

impl LanguageRegistry {
    pub fn new() -> Self {
        LanguageRegistry {
            definitions: HashMap::new(),
            file_type_map: HashMap::new(),
            runtimes_cache: Mutex::new(HashMap::new()),
        }
    }

    pub fn register_language(&mut self, definition: LanguageDefinition) -> Result<(), String> {
        if self.definitions.contains_key(&definition.id) {
            return Err(format!("Language with ID '{}' already registered.", definition.id));
        }
        for file_type in &definition.file_types {
            if self.file_type_map.contains_key(file_type) {
                return Err(format!("File type '{}' already mapped to a language.", file_type));
            }
            self.file_type_map.insert(file_type.clone(), definition.id.clone());
        }
        self.definitions.insert(definition.id.clone(), definition);
        Ok(())
    }

    pub fn resolve_language(&self, file_path: &str) -> Option<&LanguageDefinition> {
        let path = PathBuf::from(file_path);
        let extension = path.extension()?.to_str()?;
        let lang_id = self.file_type_map.get(&format!(".{}", extension))?;
        self.definitions.get(lang_id)
    }

    pub fn get_language_runtime(&self, id: &LanguageId) -> Result<Arc<LanguageRuntime>, String> {
        let cache = self.runtimes_cache.lock().unwrap();

        if let Some(runtime) = cache.get(id) {
            return Ok(Arc::clone(runtime));
        }

        let _definition = self.definitions.get(id)
            .ok_or_else(|| format!("Language definition for ID '{}' not found.", id))?;

        // TODO (Phase 6): Implement native dynamic loading via libloading.
        // Use `libloading` to open the parser .so/.dylib/.dll and call
        // `tree_sitter_<language>()` to obtain the Language handle.
        // Until then, use the WASM-based registry in infrastructure::syntax::dynamic_parser.
        Err(format!(
            "Native dynamic loading not yet implemented for '{}'. \
             Use infrastructure::syntax::dynamic_parser::REGISTRY for WASM-based loading.",
            id
        ))
    }
}

lazy_static! {
    pub static ref LANGUAGE_REGISTRY: Arc<Mutex<LanguageRegistry>> = Arc::new(Mutex::new(LanguageRegistry::new()));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_definition(id: &str, file_types: Vec<&str>) -> LanguageDefinition {
        LanguageDefinition {
            id: id.to_string(),
            name: id.to_string(),
            file_types: file_types.into_iter().map(String::from).collect(),
            scope: format!("source.{}", id),
            parser_name: format!("tree-sitter-{}", id),
            parser_path: PathBuf::from(format!("/fake/{}.so", id)),
            query_paths: LanguageQueryPaths {
                highlights: PathBuf::from(format!("/fake/{}/highlights.scm", id)),
                injections: None,
                folds: None,
            },
        }
    }

    #[test]
    fn new_registry_is_empty() {
        let registry = LanguageRegistry::new();
        assert!(registry.resolve_language("file.rs").is_none());
    }

    #[test]
    fn register_and_resolve_by_extension() {
        let mut registry = LanguageRegistry::new();
        registry.register_language(make_definition("rust", vec![".rs"])).unwrap();
        let def = registry.resolve_language("/project/main.rs");
        assert!(def.is_some());
        assert_eq!(def.unwrap().id, "rust");
    }

    #[test]
    fn resolve_unknown_extension_returns_none() {
        let mut registry = LanguageRegistry::new();
        registry.register_language(make_definition("rust", vec![".rs"])).unwrap();
        assert!(registry.resolve_language("file.py").is_none());
    }

    #[test]
    fn duplicate_language_id_returns_error() {
        let mut registry = LanguageRegistry::new();
        registry.register_language(make_definition("rust", vec![".rs"])).unwrap();
        let result = registry.register_language(make_definition("rust", vec![".rsx"]));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already registered"));
    }

    #[test]
    fn duplicate_file_type_returns_error() {
        let mut registry = LanguageRegistry::new();
        registry.register_language(make_definition("rust", vec![".rs"])).unwrap();
        let result = registry.register_language(make_definition("rust2", vec![".rs"]));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already mapped"));
    }

    #[test]
    fn get_language_runtime_for_unregistered_id_returns_err() {
        let registry = LanguageRegistry::new();
        let result = registry.get_language_runtime(&"unknown".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn get_language_runtime_for_registered_returns_not_implemented_err() {
        let mut registry = LanguageRegistry::new();
        registry.register_language(make_definition("rust", vec![".rs"])).unwrap();
        let result = registry.get_language_runtime(&"rust".to_string());
        assert!(result.is_err());
        let err = result.err().unwrap();
        assert!(err.contains("not yet implemented"), "expected 'not yet implemented' in: {}", err);
    }

    #[test]
    fn register_multiple_languages() {
        let mut registry = LanguageRegistry::new();
        registry.register_language(make_definition("rust", vec![".rs"])).unwrap();
        registry.register_language(make_definition("python", vec![".py"])).unwrap();
        registry.register_language(make_definition("typescript", vec![".ts", ".tsx"])).unwrap();
        assert!(registry.resolve_language("main.rs").is_some());
        assert!(registry.resolve_language("app.py").is_some());
        assert!(registry.resolve_language("component.tsx").is_some());
    }
}
