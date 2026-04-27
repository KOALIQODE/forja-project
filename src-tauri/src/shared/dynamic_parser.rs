use anyhow::{Context, Result};
use lazy_static::lazy_static;
use libloading::Library;
use parking_lot::RwLock;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use tauri::Emitter;
// use reqwest::blocking::Client;

lazy_static! {
    pub static ref REGISTRY: LanguageRegistry =
        LanguageRegistry::new().expect("Failed to init registry");
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

    pub fn get_config_dir(&self) -> &PathBuf {
        &self.config_dir
    }

    pub fn is_enabled(&self, language: &str) -> bool {
        self.enabled_languages.read().contains(language)
    }

    pub fn get_parser_lib_path(&self, language: &str) -> PathBuf {
        let ext = if cfg!(target_os = "windows") {
            "dll"
        } else if cfg!(target_os = "macos") {
            "dylib"
        } else {
            "so"
        };
        self.parsers_dir
            .join(language)
            .join(format!("parser.{}", ext))
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
            ("typescript", "TypeScript", 0.9),
            ("python", "Python", 0.6),
            ("json", "JSON", 0.3),
            ("svelte", "Svelte", 0.7),
            ("html", "HTML", 0.4),
            ("css", "CSS", 0.4),
            ("markdown", "Markdown", 0.5),
            ("go", "Go", 0.6),
            ("cpp", "C++", 0.8),
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
                let lib = Library::new(&lib_path).with_context(|| {
                    format!("Failed to load library for {}: {:?}", language, lib_path)
                })?;
                let symbol_name = format!("tree_sitter_{}", language.replace("-", "_"));
                let language_fn: libloading::Symbol<
                    unsafe extern "C" fn() -> tree_sitter::Language,
                > = lib.get(symbol_name.as_bytes())?;
                let lang = language_fn();
                std::mem::forget(lib); // Keep lib in memory
                self.loaded_languages
                    .write()
                    .insert(language.to_string(), lang);
                return Ok(lang);
            }
        }

        anyhow::bail!(
            "Parser library for {} not found at {:?}",
            language,
            lib_path
        );
    }

    pub fn download_and_install(
        &self,
        language: &str,
        app_handle: &tauri::AppHandle,
    ) -> Result<()> {
        let _ = app_handle.emit("parser-download-start", language);

        let platform = if cfg!(target_os = "windows") {
            "windows-x64"
        } else if cfg!(target_os = "macos") {
            "macos-arm64"
        } else {
            "linux-x64"
        };
        let ext = if cfg!(target_os = "windows") {
            "dll"
        } else if cfg!(target_os = "macos") {
            "dylib"
        } else {
            "so"
        };

        // --- URLs ---
        let base_assets_url = "https://github.com/KOALIQODE/forja-assets/releases/download/parsers";
        let lib_url = format!("{}/{}-{}.{}", base_assets_url, language, platform, ext);
        let scm_url = format!("https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/master/queries/{}/highlights.scm", language);

        let lang_dir = self.parsers_dir.join(language);
        std::fs::create_dir_all(&lang_dir)?;

        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .user_agent("Forja-Studio")
            .build()?;

        // 1. Descargar queries (.scm) - OBLIGATORIO para el resaltado
        let _ = app_handle.emit("parser-status", (language, "Fetching queries..."));
        let scm_res = client.get(&scm_url).send();
        match scm_res {
            Ok(res) if res.status().is_success() => {
                let scm_text = res.text()?;
                std::fs::write(self.get_queries_path(language), scm_text)?;
            }
            Ok(res) => {
                let status = res.status();
                eprintln!("SCM Download failed for {}: {}", language, status);
                let _ = app_handle.emit(
                    "parser-status",
                    (language, format!("Queries not found (HTTP {})", status)),
                );
                anyhow::bail!("Queries not found for {} (HTTP {})", language, status);
            }
            Err(e) => {
                let _ = app_handle.emit(
                    "parser-status",
                    (language, format!("Network error fetching queries: {}", e)),
                );
                anyhow::bail!("Network error fetching queries: {}", e)
            }
        }

        // 2. Descargar binario (.so/.dll)
        let _ = app_handle.emit("parser-status", (language, "Downloading binary..."));
        let lib_res = client.get(&lib_url).send();
        match lib_res {
            Ok(res) if res.status().is_success() => {
                let lib_bytes = res.bytes()?;
                std::fs::write(self.get_parser_lib_path(language), lib_bytes)?;
            }
            Ok(res) => {
                let status = res.status();
                eprintln!(
                    "Binary download failed for {} on {} (HTTP {}). Path: {}",
                    language, platform, status, lib_url
                );
                let _ = app_handle.emit(
                    "parser-status",
                    (
                        language,
                        format!("Binary not available for {} (HTTP {})", platform, status),
                    ),
                );
                anyhow::bail!(
                    "Parser binary not available for {} on {} (HTTP {}). URL: {}",
                    language,
                    platform,
                    status,
                    lib_url
                );
            }
            Err(e) => {
                let _ = app_handle.emit(
                    "parser-status",
                    (language, format!("Network error downloading binary: {}", e)),
                );
                anyhow::bail!("Network error downloading binary: {}", e);
            }
        }

        self.enabled_languages.write().insert(language.to_string());

        let enabled_path = self.config_dir.join("enabled_languages.json");
        let enabled_json = serde_json::to_string(&*self.enabled_languages.read())?;
        std::fs::write(enabled_path, enabled_json)?;

        let _ = app_handle.emit("parser-status", (language, "Ready"));
        let _ = app_handle.emit("parser-ready", language);
        Ok(())
    }
}

pub struct DynamicParser;

impl DynamicParser {
    pub fn load(language: &str, registry: &LanguageRegistry) -> Result<tree_sitter::Language> {
        registry.load_language(language)
    }
}
