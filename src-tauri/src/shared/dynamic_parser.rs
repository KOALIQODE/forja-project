use std::path::PathBuf;
use std::collections::{HashMap, HashSet};
use parking_lot::RwLock;
use anyhow::{Result, Context};
use lazy_static::lazy_static;
use libloading::Library;
use reqwest::blocking::Client;
use tauri::Emitter;

lazy_static! {
    pub static ref REGISTRY: LanguageRegistry = LanguageRegistry::new().expect("Failed to init registry");
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ParserMetadata {
    pub name: String,
    pub language: String,
    pub installed: bool,
    pub size_mb: f64,
}

pub struct LanguageRegistry {
    pub config_dir: PathBuf,
    pub parsers_dir: PathBuf,
    pub loaded_languages: RwLock<HashMap<String, tree_sitter::Language>>,
    pub enabled_languages: RwLock<HashSet<String>>,
}

impl LanguageRegistry {
    pub fn new() -> Result<Self> {
        let config_dir = dirs::config_dir()
            .context("Failed to get config dir")?
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

    pub fn get_parser_lib_path(&self, language: &str) -> PathBuf {
        let ext = if cfg!(target_os = "windows") { "dll" } else if cfg!(target_os = "macos") { "dylib" } else { "so" };
        self.parsers_dir.join(language).join(format!("parser.{}", ext))
    }

    pub fn get_queries_path(&self, language: &str) -> PathBuf {
        self.parsers_dir.join(language).join("highlights.scm")
    }

    pub fn is_language_installed(&self, language: &str) -> bool {
        self.get_parser_lib_path(language).exists() && self.get_queries_path(language).exists()
    }

    pub fn get_metadata_list(&self) -> Vec<ParserMetadata> {
        let mut list = Vec::new();
        let languages = [
            ("rust", "Rust", 0.5),
            ("javascript", "JavaScript", 0.8),
            ("python", "Python", 0.6),
            ("json", "JSON", 0.3),
            ("svelte", "Svelte", 0.7),
        ];

        for (id, name, size) in languages {
            list.push(ParserMetadata {
                name: name.to_string(),
                language: id.to_string(),
                installed: self.is_language_installed(id),
                size_mb: size,
            });
        }
        list
    }

    pub fn load_language(&self, language: &str) -> Result<tree_sitter::Language> {
        // 1. Check memory cache
        if let Some(lang) = self.loaded_languages.read().get(language) {
            return Ok(*lang);
        }

        // 2. Try loading from disk (Dynamic .so/.dll)
        let lib_path = self.get_parser_lib_path(language);
        if lib_path.exists() {
            unsafe {
                let lib = Library::new(&lib_path)?;
                let symbol_name = format!("tree_sitter_{}", language.replace("-", "_"));
                let language_fn: libloading::Symbol<unsafe extern "C" fn() -> tree_sitter::Language> = lib.get(symbol_name.as_bytes())?;
                let lang = language_fn(); // lang is created here
                std::mem::forget(lib); // Keep lib in memory
                self.loaded_languages.write().insert(language.to_string(), lang);
                return Ok(lang); // Returns OK here if loaded dynamically
            }
        }

        // 3. Fallback to embedded (Static) - Removed as per user request
        // This section is intentionally left empty to avoid defining 'lang' if not used.
        // If no language is found in cache or dynamically, we should return an error.
        
        // If we reach here, it means the language was not found in cache and not loaded dynamically.
        // We should return an error, similar to how the fallback would have behaved.
        anyhow::bail!("Language {} not installed and no fallback available.", language);
    }

    pub fn download_and_install(&self, language: &str, window: &tauri::Window) -> Result<()> {
        let _ = window.emit("parser-download-start", language);
        
        let platform = if cfg!(target_os = "windows") { "windows-x64" } else if cfg!(target_os = "macos") { "macos-arm64" } else { "linux-x64" };
        let ext = if cfg!(target_os = "windows") { "dll" } else if cfg!(target_os = "macos") { "dylib" } else { "so" };
        
        // --- NOTA: En producción, estas URLs apuntarían a tu servidor de assets ---
        let base_url = format!("https://github.com/KOALIQODE/forja-assets/releases/download/parsers");
        let lib_url = format!("{}/{}-{}.{}", base_url, language, platform, ext);
        let scm_url = format!("{}/{}-highlights.scm", base_url, language);

        let lang_dir = self.parsers_dir.join(language);
        std::fs::create_dir_all(&lang_dir)?;

        let client = Client::new();
        
        // 1. Descargar binario (.so/.dll)
        let _ = window.emit("parser-downloading", (language, "30%"));
        let lib_bytes = client.get(&lib_url).send()?.bytes()?;
        std::fs::write(self.get_parser_lib_path(language), lib_bytes)?;

        // 2. Descargar queries (.scm)
        let _ = window.emit("parser-downloading", (language, "80%"));
        let scm_bytes = client.get(&scm_url).send()?.bytes()?;
        std::fs::write(self.get_queries_path(language), scm_bytes)?;

        let _ = window.emit("parser-downloading", (language, "100%"));
        
        self.enabled_languages.write().insert(language.to_string());
        let _ = window.emit("parser-installed", language);
        
        Ok(())
    }
}

pub struct DynamicParser;

impl DynamicParser {
    pub fn load(language: &str, registry: &LanguageRegistry) -> Result<tree_sitter::Language> {
        registry.load_language(language)
    }
}
