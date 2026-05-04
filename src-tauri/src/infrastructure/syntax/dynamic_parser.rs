//! Dynamic parser registry — WASM-based language loading and metadata.
//!
//! [`REGISTRY`] is the global singleton that tracks installed languages,
//! their WASM parser files, and their highlight query paths.
//! It bridges the filesystem-resident parser artifacts (managed by
//! [`crate::parser`]) with the syntax highlighting pipeline.

use anyhow::{Context, Result};
use lazy_static::lazy_static;
use parking_lot::RwLock;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use tree_sitter::Language;

lazy_static! {
    /// Global language registry singleton.
    pub static ref REGISTRY: LanguageRegistry =
        LanguageRegistry::new().expect("Failed to init registry");
}

/// Parser metadata exposed to the frontend.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ParserMetadata {
    pub name: String,
    pub language: String,
    pub installed: bool,
    pub is_native: bool,
    pub size_mb: f64,
}

/// Registry of installed and available WASM parsers.
pub struct LanguageRegistry {
    pub config_dir: PathBuf,
    pub parsers_dir: PathBuf,
    #[allow(dead_code)] pub loaded_languages: RwLock<HashMap<String, Language>>,
    pub enabled_languages: RwLock<HashSet<String>>,
}

impl LanguageRegistry {
    pub fn new() -> Result<Self> {
        let config_dir = dirs::data_local_dir()
                .context("Failed to get data dir")?
                .join("forja");

        let parsers_dir = config_dir.join("parsers");
        std::fs::create_dir_all(&parsers_dir)?;

        let enabled_path = config_dir.join("enabled_languages.json");
        let enabled_languages = if enabled_path.exists() {
            let content = std::fs::read_to_string(enabled_path)?;
            serde_json::from_str(&content).unwrap_or_else(|_| HashSet::new())
        } else {
            HashSet::new()
        };

        Ok(Self {
            config_dir,
            parsers_dir,
            loaded_languages: RwLock::new(HashMap::new()),
            enabled_languages: RwLock::new(enabled_languages),
        })
    }

    pub fn get_config_dir(&self) -> &PathBuf {
        &self.config_dir
    }

    pub fn is_enabled(&self, language: &str) -> bool {
        self.enabled_languages.read().contains(language)
    }

    pub fn get_parser_lib_path(&self, language: &str) -> PathBuf {
        self.parsers_dir
            .join(format!("tree-sitter-{}.wasm", language))
    }

    pub fn get_queries_path(&self, language: &str) -> PathBuf {
        self.parsers_dir.join(language).join("highlights.scm")
    }

    pub fn is_language_installed(&self, language: &str) -> bool {
        self.get_parser_lib_path(language).exists() && self.get_queries_path(language).exists()
    }

    pub fn get_metadata_list(&self) -> Vec<ParserMetadata> {
        use crate::parser::registry::PARSER_REGISTRY;
        use crate::parser::cache::CacheManager;

        let cache = CacheManager::new().ok();

        PARSER_REGISTRY.iter().map(|entry| {
            let native_ready = cache.as_ref().map_or(false, |c| c.is_parser_ready(entry.name));
            let wasm_ready = self.is_language_installed(entry.name);
            ParserMetadata {
                name: format!("tree-sitter-{}", entry.name),
                language: entry.name.to_string(),
                installed: native_ready || wasm_ready,
                is_native: false,
                size_mb: 0.0,
            }
        }).collect()
    }

    #[allow(dead_code)]
    pub fn load_language(&self, language: &str) -> Result<Language> {
        if let Some(lang) = self.loaded_languages.read().get(language) {
            return Ok(lang.clone());
        }

        use crate::parser::cache::CacheManager;
        use crate::parser::loader::ParserLoader;

        let cache = CacheManager::new()
            .map_err(|e| anyhow::anyhow!("Failed to init CacheManager: {}", e))?;
        let bin_path = cache.binary_path(language);

        if !bin_path.exists() {
            anyhow::bail!("Parser binary for '{}' not installed at {:?}", language, bin_path);
        }

        let mut loader = ParserLoader::new();
        let lang = unsafe { loader.load_language(language, &bin_path) }
            .map_err(|e| anyhow::anyhow!("Failed to load native parser for '{}': {}", language, e))?;

        self.loaded_languages.write().insert(language.to_string(), lang.clone());
        Ok(lang)
    }

    // UNUSED: download_and_install — superseded by ParserManager in crate::parser
    // pub fn download_and_install(&self, language: &str, app_handle: &tauri::AppHandle) -> Result<()> { ... }
}

/// Convenience wrapper for loading a language via the global registry.
#[allow(dead_code)]
pub struct DynamicParser;

impl DynamicParser {
    #[allow(dead_code)]
    pub fn load(language: &str, registry: &LanguageRegistry) -> Result<tree_sitter::Language> {
        registry.load_language(language)
    }
}
