use anyhow::{Context, Result};
use lazy_static::lazy_static;
use parking_lot::RwLock;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use tree_sitter::{Language, WasmStore};
use tree_sitter::wasmtime::Engine;

lazy_static! {
    pub static ref REGISTRY: LanguageRegistry =
        LanguageRegistry::new().expect("Failed to init registry");
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ParserMetadata {
    pub name: String,
    pub language: String,
    pub installed: bool,
    pub is_native: bool,  // true = bundled in binary, false = user-installable WASM
    pub size_mb: f64,
}

pub struct LanguageRegistry {
    pub config_dir: PathBuf,
    pub parsers_dir: PathBuf,
    pub loaded_languages: RwLock<HashMap<String, Language>>,
    pub enabled_languages: RwLock<HashSet<String>>,
    pub wasm_engine: Engine,
}

impl LanguageRegistry {
    pub fn new() -> Result<Self> {
        let config_dir = dirs::data_local_dir()  // ~/.local/share en Linux
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

        let wasm_engine = Engine::default();

        Ok(Self {
            config_dir,
            parsers_dir,
            loaded_languages: RwLock::new(HashMap::new()),
            enabled_languages: RwLock::new(enabled_languages),
            wasm_engine,
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
        use crate::shared::native_languages::{is_native, NATIVE_LANGUAGES};

        let mut list = Vec::new();

        // ── Native languages (always installed, compiled into binary) ────────────
        for (id, name) in NATIVE_LANGUAGES {
            list.push(ParserMetadata {
                name: name.to_string(),
                language: id.to_string(),
                installed: true,
                is_native: true,
                size_mb: 0.0,
            });
        }

        // ── Community languages (WASM — user must install) ───────────────────────
        let community = [
            ("svelte", "Svelte",  0.7),
            ("cpp",    "C++",     0.8),
            ("java",   "Java",    0.9),
            ("ruby",   "Ruby",    0.6),
            ("php",    "PHP",     0.7),
            ("toml",   "TOML",    0.3),
            ("yaml",   "YAML",    0.4),
            ("bash",   "Bash",    0.4),
            ("lua",    "Lua",     0.4),
            ("c",      "C",       0.5),
        ];
        for (id, name, size) in community {
            if !is_native(id) {
                list.push(ParserMetadata {
                    name: name.to_string(),
                    language: id.to_string(),
                    installed: self.is_language_installed(id),
                    is_native: false,
                    size_mb: size,
                });
            }
        }
        list
    }

    pub fn load_language(&self, language: &str) -> Result<Language> {
        // 1. Check memory cache
        if let Some(lang) = self.loaded_languages.read().get(language) {
            return Ok(lang.clone());
        }

        // 2. Try loading from disk (Wasm)
        let wasm_path = self.get_parser_lib_path(language);
        if wasm_path.exists() {
            let wasm_bytes = std::fs::read(&wasm_path)
                .with_context(|| format!("Failed to read Wasm parser at {:?}", wasm_path))?;
            
            let mut store = WasmStore::new(&self.wasm_engine)?;
            let lang = store.load_language(language, &wasm_bytes)
                .with_context(|| format!("Failed to load Wasm language for {}", language))?;
            
            self.loaded_languages
                .write()
                .insert(language.to_string(), lang.clone());
            
            return Ok(lang);
        }

        anyhow::bail!(
            "Parser Wasm library for {} not found at {:?}",
            language,
            wasm_path
        );
    }

    // pub fn download_and_install(
    //     &self,
    //     language: &str,
    //     app_handle: &tauri::AppHandle,
    // ) -> Result<()> {
    //     let _ = app_handle.emit("parser-download-start", language);

    //     let platform = if cfg!(target_os = "windows") {
    //         "windows-x64"
    //     } else if cfg!(target_os = "macos") {
    //         "macos-arm64"
    //     } else {
    //         "linux-x64"
    //     };
    //     let ext = if cfg!(target_os = "windows") {
    //         "dll"
    //     } else if cfg!(target_os = "macos") {
    //         "dylib"
    //     } else {
    //         "so"
    //     };

    //     // --- URLs ---
    //     let base_assets_url = "https://github.com/KOALIQODE/forja-assets/releases/download/parsers";
    //     let lib_url = format!("{}/{}-{}.{}", base_assets_url, language, platform, ext);
    //     let scm_url = format!("https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/master/queries/{}/highlights.scm", language);

    //     let lang_dir = self.parsers_dir.join(language);
    //     std::fs::create_dir_all(&lang_dir)?;

    //     let client = reqwest::blocking::Client::builder()
    //         .timeout(std::time::Duration::from_secs(30))
    //         .user_agent("Forja-Studio")
    //         .build()?;

    //     // 1. Descargar queries (.scm) - OBLIGATORIO para el resaltado
    //     let _ = app_handle.emit("parser-status", (language, "Fetching queries..."));
    //     let scm_res = client.get(&scm_url).send();
    //     match scm_res {
    //         Ok(res) if res.status().is_success() => {
    //             let scm_text = res.text()?;
    //             std::fs::write(self.get_queries_path(language), scm_text)?;
    //         }
    //         Ok(res) => {
    //             let status = res.status();
    //             eprintln!("SCM Download failed for {}: {}", language, status);
    //             let _ = app_handle.emit(
    //                 "parser-status",
    //                 (language, format!("Queries not found (HTTP {})", status)),
    //             );
    //             anyhow::bail!("Queries not found for {} (HTTP {})", language, status);
    //         }
    //         Err(e) => {
    //             let _ = app_handle.emit(
    //                 "parser-status",
    //                 (language, format!("Network error fetching queries: {}", e)),
    //             );
    //             anyhow::bail!("Network error fetching queries: {}", e)
    //         }
    //     }

    //     // 2. Descargar binario (.so/.dll)
    //     let _ = app_handle.emit("parser-status", (language, "Downloading binary..."));
    //     let lib_res = client.get(&lib_url).send();
    //     match lib_res {
    //         Ok(res) if res.status().is_success() => {
    //             let lib_bytes = res.bytes()?;
    //             std::fs::write(self.get_parser_lib_path(language), lib_bytes)?;
    //         }
    //         Ok(res) => {
    //             let status = res.status();
    //             eprintln!(
    //                 "Binary download failed for {} on {} (HTTP {}). Path: {}",
    //                 language, platform, status, lib_url
    //             );
    //             let _ = app_handle.emit(
    //                 "parser-status",
    //                 (
    //                     language,
    //                     format!("Binary not available for {} (HTTP {})", platform, status),
    //                 ),
    //             );
    //             anyhow::bail!(
    //                 "Parser binary not available for {} on {} (HTTP {}). URL: {}",
    //                 language,
    //                 platform,
    //                 status,
    //                 lib_url
    //             );
    //         }
    //         Err(e) => {
    //             let _ = app_handle.emit(
    //                 "parser-status",
    //                 (language, format!("Network error downloading binary: {}", e)),
    //             );
    //             anyhow::bail!("Network error downloading binary: {}", e);
    //         }
    //     }

    //     self.enabled_languages.write().insert(language.to_string());

    //     let enabled_path = self.config_dir.join("enabled_languages.json");
    //     let enabled_json = serde_json::to_string(&*self.enabled_languages.read())?;
    //     std::fs::write(enabled_path, enabled_json)?;

    //     let _ = app_handle.emit("parser-status", (language, "Ready"));
    //     let _ = app_handle.emit("parser-ready", language);
    //     Ok(())
    // }
}

pub struct DynamicParser;

impl DynamicParser {
    pub fn load(language: &str, registry: &LanguageRegistry) -> Result<tree_sitter::Language> {
        registry.load_language(language)
    }
}
