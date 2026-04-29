// src-tauri/src/language/mod.rs
//
// Phase 6 scaffolding: native multi-language registry using pre-compiled parsers.
// Currently unused — the project loads languages via WASM (shared/dynamic_parser.rs).
// These structs will replace dynamic_parser.rs once native parsers are packaged.
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
    pub parser_name: String, // e.g., "javascript", "rust", "typescript"
    pub parser_path: PathBuf, // Path to the compiled tree-sitter parser library (.so, .dylib, .dll)
    pub query_paths: LanguageQueryPaths,
}

/// Represents a language ready for use, containing its parser, compiled queries, and metadata.
pub struct LanguageRuntime {
    pub id: LanguageId,
    pub parser: Parser,
    pub language: Language, // The actual tree-sitter Language struct
    pub highlight_query: Option<String>,
    // TODO: Add other queries (injections, folds)
    pub definition: LanguageDefinition,
}

impl LanguageRuntime {
    pub fn new(id: LanguageId, language: Language, parser: Parser, definition: LanguageDefinition) -> Self {
        LanguageRuntime {
            id,
            parser,
            language,
            highlight_query: None, // Will be loaded and compiled by LanguageLoader
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
    file_type_map: HashMap<String, LanguageId>, // e.g., ".js" -> "javascript"
    runtimes_cache: Mutex<HashMap<LanguageId, Arc<LanguageRuntime>>>,
    // TODO: Add parser library loading for dynamic languages if needed
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
        // Until then, use the WASM-based registry in shared/dynamic_parser.rs.
        Err(format!(
            "Native dynamic loading not yet implemented for '{}'. \
             Use shared::dynamic_parser::REGISTRY for WASM-based loading.",
            id
        ))
    }
}

lazy_static! {
    pub static ref LANGUAGE_REGISTRY: Arc<Mutex<LanguageRegistry>> = Arc::new(Mutex::new(LanguageRegistry::new()));
}
