use crate::models::parser_info::ParserInfo;
use super::cache::CacheManager;
use super::compiler::ParserCompiler;
use super::downloader::BinaryDownloader;
use super::registry::{ParserEntry, PARSER_REGISTRY};
use super::validator::BinaryValidator;
use std::path::PathBuf;

/// Base URL where GitHub Actions publishes prebuilt grammar binaries.
/// Assets follow the naming convention: `{parser}-{platform}.{ext}`
/// e.g. `rust-linux-x86_64.so`, `css-macos-arm64.dylib`, `json-windows-x86_64.dll`
const FORJA_CDN_BASE: &str =
    "https://github.com/KOALIQODE/forja-project/releases/download/grammars";

pub struct ParserManager {
    pub cache_manager: CacheManager,
    pub downloader: BinaryDownloader,
    pub compiler: ParserCompiler,
}

impl ParserManager {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let cache_manager = CacheManager::new()?;
        let compiler = ParserCompiler::new(cache_manager.cache_dir.clone());
        Ok(ParserManager {
            cache_manager,
            downloader: BinaryDownloader::new(),
            compiler,
        })
    }

    pub fn get_all_parsers(&self) -> Vec<ParserInfo> {
        PARSER_REGISTRY.iter()
            .filter(|entry| !entry.hidden)
            .map(|entry| ParserInfo {
            name: format!("tree-sitter-{}", entry.name),
            language: entry.name.to_string(),
            version: "latest".to_string(),
            source_url: format!("https://github.com/{}", entry.github_repo),
            binary_url: String::new(),
            sha256: String::new(),
            file_size: 0,
            supported_platforms: vec![
                "linux-x86_64".to_string(),
                "macos-x86_64".to_string(),
                "macos-arm64".to_string(),
                "windows-x86_64".to_string(),
            ],
            installed: self.cache_manager.is_parser_ready(entry.name),
            installed_at: None,
        }).collect()
    }

    pub fn get_parser_info(&self, parser_name: &str) -> Option<ParserInfo> {
        PARSER_REGISTRY.iter()
            .find(|e| e.name == parser_name)
            .map(|entry| ParserInfo {
                name: format!("tree-sitter-{}", entry.name),
                language: entry.name.to_string(),
                version: "latest".to_string(),
                source_url: format!("https://github.com/{}", entry.github_repo),
                binary_url: String::new(),
                sha256: String::new(),
                file_size: 0,
                supported_platforms: vec![
                    "linux-x86_64".to_string(),
                    "macos-x86_64".to_string(),
                    "macos-arm64".to_string(),
                    "windows-x86_64".to_string(),
                ],
                installed: self.cache_manager.is_parser_ready(entry.name),
                installed_at: None,
            })
    }

    pub async fn ensure_parser_available(
        &self,
        parser_name: &str,
        on_progress: Box<dyn Fn(u64, u64) + Send>,
    ) -> Result<PathBuf, Box<dyn std::error::Error>> {
        println!("🔍 Checking parser: {}", parser_name);

        if self.cache_manager.is_parser_ready(parser_name) {
            println!("✅ {} already installed", parser_name);
            return Ok(self.cache_manager.binary_path(parser_name));
        }

        let entry = PARSER_REGISTRY.iter()
            .find(|e| e.name == parser_name)
            .ok_or_else(|| format!("Unknown parser: {}", parser_name))?;

        // ── Step 1: Try Forja CDN (prebuilt binary, no compiler needed) ──────────
        // Map the error to String immediately so the non-Send Box<dyn Error>
        // is dropped before any subsequent `.await` boundary.
        let cdn_result: Result<PathBuf, String> = self
            .download_from_cdn(parser_name, on_progress)
            .await
            .map_err(|e| e.to_string());

        let binary_path: PathBuf = match cdn_result {
            Ok(p) => {
                println!("✅ {} downloaded from Forja CDN", parser_name);
                p
            }
            Err(cdn_msg) => {
                eprintln!("⚠️  CDN unavailable for {} ({}), trying local compilation…", parser_name, cdn_msg);

                match self.compiler.compile(parser_name, entry.github_repo, entry.subdir).await {
                    Ok(p) => {
                        println!("✅ {} compiled from source", parser_name);
                        p
                    }
                    Err(compile_err) => {
                        return Err(format!(
                            "Could not install the '{name}' parser.\n\
                             • CDN download failed: {cdn_msg}\n\
                             • Local compilation failed: {compile_err}\n\n\
                             Make sure you have an internet connection. \
                             If you are offline, install a C compiler (gcc/clang) to build from source.",
                            name = parser_name,
                        ).into());
                    }
                }
            }
        };

        // ── Step 3: Download highlight queries ───────────────────────────────────
        let queries_path = self.cache_manager.queries_path(parser_name);
        let needs_queries = !queries_path.exists()
            || matches!(parser_name, "typescript" | "tsx")
            || std::fs::read_to_string(&queries_path)
                .map(|c| c.lines().any(|l| l.trim().starts_with("; inherits:")))
                .unwrap_or(false);
        if needs_queries {
            self.download_queries(parser_name).await?;
        }

        // ── Step 4: Auto-install markdown_inline companion ───────────────────────
        if parser_name == "markdown" && !self.cache_manager.is_parser_ready("markdown_inline") {
            println!("📦 Installing markdown_inline companion…");
            Box::pin(self.ensure_parser_available("markdown_inline", Box::new(|_, _| {}))).await
                .unwrap_or_else(|e| {
                    eprintln!("⚠️  markdown_inline companion failed: {}", e);
                    self.cache_manager.binary_path("markdown_inline")
                });
        }

        Ok(binary_path)
    }

    /// Build the CDN URL and download the prebuilt binary for the current platform.
    async fn download_from_cdn(
        &self,
        parser_name: &str,
        on_progress: Box<dyn Fn(u64, u64) + Send>,
    ) -> Result<PathBuf, Box<dyn std::error::Error>> {
        let platform = self.get_target_platform();
        let ext = if cfg!(target_os = "windows") { "dll" }
                  else if cfg!(target_os = "macos") { "dylib" }
                  else { "so" };

        let url = format!("{}/{}-{}.{}", FORJA_CDN_BASE, parser_name, platform, ext);
        println!("⬇️  Fetching {} from CDN…", url);

        let temp_dir = tempfile::tempdir()?;
        let temp_path = temp_dir.path().join(format!("parser.{}", ext));

        self.downloader
            .download_from_url(&url, &temp_path, on_progress)
            .await?;

        // Validate the binary is a real shared library before accepting it
        BinaryValidator::validate_binary_format(&temp_path)?;

        // Move to permanent cache
        let parser_dir = self.cache_manager.parser_dir(parser_name);
        std::fs::create_dir_all(&parser_dir)?;
        let final_path = self.cache_manager.binary_path(parser_name);
        std::fs::rename(&temp_path, &final_path)
            .or_else(|_| std::fs::copy(&temp_path, &final_path).map(|_| ()))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&final_path, std::fs::Permissions::from_mode(0o755))?;
        }

        // Save metadata so cache-invalidation logic can track the source
        self.save_parser_metadata(
            parser_name,
            PARSER_REGISTRY.iter().find(|e| e.name == parser_name).unwrap(),
        )?;

        Ok(final_path)
    }

    async fn download_queries(&self, parser_name: &str) -> Result<(), Box<dyn std::error::Error>> {
        println!("📋 Downloading highlight queries for {}", parser_name);

        let queries_path = self.cache_manager.queries_path(parser_name);
        if let Some(parent) = queries_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .user_agent("Forja-Studio/1.0")
            .build()?;

        // TypeScript/TSX: combine full JavaScript queries + TS-specific queries.
        // TS grammar is a superset of JS — its highlights.scm only covers TS additions
        // (type_identifier, type_annotation, etc.) so we must prepend JS queries for
        // complete highlighting of strings, functions, comments, operators, etc.
        if matches!(parser_name, "typescript" | "tsx") {
            return self.download_typescript_queries(&client, parser_name).await;
        }

        // Try master then main — official tree-sitter repos use master, community repos use main.
        for branch in &["master", "main"] {
            let url = self.query_url_for_branch(parser_name, branch);
            if let Ok(res) = client.get(&url).send().await {
                if res.status().is_success() {
                    let text = res.text().await?;
                    let resolved = self.resolve_inherits(&client, &text).await;
                    std::fs::write(&queries_path, &resolved)?;
                    println!("✅ Queries downloaded for {} ({})", parser_name, branch);
                    return Ok(());
                }
            }
        }

        std::fs::write(&queries_path, "")?;
        eprintln!("⚠️ No highlight queries found for {}, highlighting will be plain text", parser_name);
        Ok(())
    }

    /// Fetches JavaScript + TypeScript-specific queries and writes a combined file.
    /// Falls back to the bundled typescript.scm (compiled into the binary) if the
    /// GitHub download fails.
    async fn download_typescript_queries(
        &self,
        client: &reqwest::Client,
        parser_name: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let queries_path = self.cache_manager.queries_path(parser_name);

        let mut js_text = String::new();
        for branch in &["master", "main"] {
            let url = self.query_url_for_branch("javascript", branch);
            if let Ok(res) = client.get(&url).send().await {
                if res.status().is_success() {
                    js_text = res.text().await.unwrap_or_default();
                    break;
                }
            }
        }

        let mut ts_text = String::new();
        for branch in &["master", "main"] {
            let url = self.query_url_for_branch(parser_name, branch);
            if let Ok(res) = client.get(&url).send().await {
                if res.status().is_success() {
                    let raw = res.text().await.unwrap_or_default();
                    // Strip "; inherits:" lines — JS queries are prepended explicitly
                    ts_text = raw
                        .lines()
                        .filter(|l| !l.trim().starts_with("; inherits:"))
                        .collect::<Vec<_>>()
                        .join("\n");
                    break;
                }
            }
        }

        // If GitHub downloads failed, write empty queries (plain-text highlighting).
        if js_text.is_empty() && ts_text.is_empty() {
            std::fs::write(&queries_path, "")?;
            eprintln!("⚠️ TypeScript/TSX queries unavailable, highlighting will be plain text");
            return Ok(());
        }

        // If only TS-specific failed, use JS queries alone.
        if ts_text.is_empty() {
            std::fs::write(&queries_path, js_text.trim_end())?;
            println!("✅ Using JavaScript queries as fallback for {}", parser_name);
            return Ok(());
        }

        let combined = format!(
            "; === javascript (base) ===\n{}\n\n; === {} (specific) ===\n{}",
            js_text.trim_end(),
            parser_name,
            ts_text.trim_end()
        );
        std::fs::write(&queries_path, &combined)?;
        println!("✅ Combined JS + {} queries written", parser_name);
        Ok(())
    }

    /// Builds the raw.githubusercontent.com URL for a language's highlight queries,
    /// using the actual GitHub repo from PARSER_REGISTRY.
    /// For alias names not in the registry (e.g. "javascript", "html"), falls back
    /// to the canonical `tree-sitter/tree-sitter-{lang}` pattern.
    fn query_url_for_branch(&self, parser_name: &str, branch: &str) -> String {
        use super::registry::PARSER_REGISTRY;

        let entry = PARSER_REGISTRY.iter().find(|e| e.name == parser_name);
        let github_repo = entry.map(|e| e.github_repo).unwrap_or("");
        let subdir = entry.and_then(|e| e.subdir);

        if github_repo.is_empty() {
            format!(
                "https://raw.githubusercontent.com/tree-sitter/tree-sitter-{}/{}/queries/highlights.scm",
                parser_name, branch
            )
        } else if let Some(sub) = subdir {
            // For repos with multiple grammars, queries live under the subdir
            format!(
                "https://raw.githubusercontent.com/{}/{}/{}/queries/highlights.scm",
                github_repo, branch, sub
            )
        } else {
            format!(
                "https://raw.githubusercontent.com/{}/{}/queries/highlights.scm",
                github_repo, branch
            )
        }
    }

    /// Resolve `; inherits: <lang>` directives by prepending parent queries.
    /// Only one level of inheritance is resolved (sufficient for all current cases).
    async fn resolve_inherits(&self, client: &reqwest::Client, src: &str) -> String {
        // Map virtual/alias names to real tree-sitter language names
        fn canonical(name: &str) -> &str {
            match name {
                "ecma" => "javascript",
                "html_tags" | "html" => "html",
                other => other,
            }
        }

        let mut inherited_blocks: Vec<String> = Vec::new();
        let mut own_lines: Vec<&str> = Vec::new();

        for line in src.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("; inherits:") {
                for lang_alias in rest.split(',').map(|s| s.trim()) {
                    let lang = canonical(lang_alias);
                    let url = self.query_url_for_branch(lang, "master");

                    if let Ok(res) = client.get(&url).send().await {
                        if res.status().is_success() {
                            if let Ok(parent_src) = res.text().await {
                                inherited_blocks.push(format!(
                                    "; === inherited from {} ===\n{}",
                                    lang, parent_src
                                ));
                                println!("🔗 Resolved inherits:{} from {}", lang, url);
                            }
                        }
                    }
                }
                // Skip the "; inherits:" line itself (it's replaced by the real content)
            } else {
                own_lines.push(line);
            }
        }

        if inherited_blocks.is_empty() {
            return src.to_string();
        }

        // Prepend inherited queries then own queries
        let mut result = inherited_blocks.join("\n\n");
        result.push_str("\n\n; === own queries ===\n");
        result.push_str(&own_lines.join("\n"));
        result
    }

    /// Force re-download of queries for a parser (useful after bugs in prior downloads).
    pub async fn repair_queries(&self, parser_name: &str) -> Result<(), Box<dyn std::error::Error>> {
        let queries_path = self.cache_manager.queries_path(parser_name);
        if queries_path.exists() {
            std::fs::remove_file(&queries_path)?;
        }
        self.download_queries(parser_name).await
    }

    fn get_target_platform(&self) -> String {
        let os = std::env::consts::OS;
        let arch = std::env::consts::ARCH;
        match (os, arch) {
            ("linux", "x86_64") => "linux-x86_64".to_string(),
            ("macos", "x86_64") => "macos-x86_64".to_string(),
            ("macos", "aarch64") => "macos-arm64".to_string(),
            ("windows", "x86_64") => "windows-x86_64".to_string(),
            _ => format!("{}-{}", os, arch),
        }
    }

    fn save_parser_metadata(
        &self,
        parser_name: &str,
        entry: &ParserEntry,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let metadata_path = self.cache_manager.metadata_path(parser_name);
        if let Some(parent) = metadata_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let info = serde_json::json!({
            "name": entry.name,
            "github_repo": entry.github_repo,
            "has_prebuilt": entry.has_prebuilt,
            "requires_compilation": entry.requires_compilation,
            "installed_at": chrono::Utc::now().to_rfc3339(),
        });
        std::fs::write(metadata_path, serde_json::to_string_pretty(&info)?)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::parser::cache::CacheManager;
    use crate::infrastructure::parser::downloader::BinaryDownloader;
    use crate::infrastructure::parser::compiler::ParserCompiler;
    use std::env;

    /// Build a `ParserManager` pointing at a temp dir — no disk setup, no network.
    fn fake_manager() -> ParserManager {
        let cache_dir = env::temp_dir().join("forja_test_parsers");
        let cache_manager = CacheManager { cache_dir: cache_dir.clone() };
        let compiler = ParserCompiler::new(cache_dir);
        ParserManager {
            cache_manager,
            downloader: BinaryDownloader::new(),
            compiler,
        }
    }

    #[test]
    fn get_all_parsers_returns_list() {
        let manager = fake_manager();
        let parsers = manager.get_all_parsers();
        // The registry has visible entries — list must be non-empty
        assert!(!parsers.is_empty());
    }

    #[test]
    fn get_all_parsers_does_not_include_hidden() {
        let manager = fake_manager();
        let parsers = manager.get_all_parsers();
        // markdown_inline is hidden — must not appear
        assert!(!parsers.iter().any(|p| p.language == "markdown_inline"));
    }

    #[test]
    fn get_parser_info_returns_some_for_known_parser() {
        let manager = fake_manager();
        assert!(manager.get_parser_info("rust").is_some());
    }

    #[test]
    fn get_parser_info_returns_none_for_unknown() {
        let manager = fake_manager();
        assert!(manager.get_parser_info("nonexistent_xyz").is_none());
    }
}
