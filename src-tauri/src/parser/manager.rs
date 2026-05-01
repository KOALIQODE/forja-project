use crate::models::parser_info::ParserInfo;
use crate::parser::cache::CacheManager;
use crate::parser::compiler::ParserCompiler;
use crate::parser::downloader::BinaryDownloader;
use crate::parser::registry::{ParserEntry, PARSER_REGISTRY};
use crate::parser::validator::BinaryValidator;
use std::path::PathBuf;

pub struct ParserManager {
    pub cache_manager: CacheManager,
    downloader: BinaryDownloader,
    compiler: ParserCompiler,
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
        PARSER_REGISTRY.iter().map(|entry| ParserInfo {
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

        // ── Step 1: Attempt prebuilt download (if flagged) ───────────────────────
        // The error type Box<dyn Error> is not Send, so we must NOT hold `e` across
        // any `.await` boundary.  We materialise the result as Option<PathBuf> first,
        // then do the compilation await separately — by that point `e` is gone.
        let prebuilt_path: Option<std::path::PathBuf> = if entry.has_prebuilt
            && !self.cache_manager.is_parser_installed(parser_name)
        {
            match self.download_prebuilt(parser_name, entry, on_progress).await {
                Ok(p) => {
                    println!("✅ {} prebuilt downloaded", parser_name);
                    Some(p)
                }
                Err(e) => {
                    // e is consumed here (moved into format), never crosses an await
                    eprintln!("⚠️  Prebuilt failed ({}), falling back to compilation", e);
                    None
                }
            }
        } else {
            None
        };

        // ── Step 2: Resolve binary path ──────────────────────────────────────────
        // Force recompile when:
        //   a) binary or queries are missing, OR
        //   b) the registry now points to a different GitHub repo than what was compiled.
        //      This prevents binary/query mismatches when grammars are updated in the registry.
        let stored_repo = std::fs::read_to_string(self.cache_manager.metadata_path(parser_name))
            .unwrap_or_default();
        let repo_changed = stored_repo.trim() != entry.github_repo;

        let binary_path = if self.cache_manager.is_parser_installed(parser_name)
            && self.cache_manager.queries_path(parser_name).exists()
            && !repo_changed
        {
            // Binary, queries, and grammar repo all match — nothing to do
            self.cache_manager.binary_path(parser_name)
        } else if let Some(p) = prebuilt_path {
            if !repo_changed { p } else {
                self.compiler.compile(parser_name, entry.github_repo).await?
            }
        } else {
            // Compile from source; also extracts matching queries into the cache dir
            self.compiler.compile(parser_name, entry.github_repo).await?
        };

        // Step 3: download queries if:
        //  a) file doesn't exist yet, OR
        //  b) TypeScript/TSX — ZIP only has TS-specific subset; we must combine with JS, OR
        //  c) The file still has an unresolved "; inherits:" directive (e.g. Svelte → HTML).
        //     The compiler copies the raw ZIP queries which don't resolve inheritance.
        let queries_path = self.cache_manager.queries_path(parser_name);
        let needs_queries = !queries_path.exists()
            || matches!(parser_name, "typescript" | "tsx")
            || std::fs::read_to_string(&queries_path)
                .map(|c| c.lines().any(|l| l.trim().starts_with("; inherits:")))
                .unwrap_or(false);
        if needs_queries {
            self.download_queries(parser_name).await?;
        }

        Ok(binary_path)
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

        // TypeScript and TSX use a grammar that extends JavaScript.
        // The official TS highlights.scm only covers TS-specific nodes (35 lines);
        // without the JavaScript base queries the vast majority of tokens
        // (comments, strings, functions, numbers, operators…) go uncoloured.
        // We always combine JS + TS queries for these two languages.
        if matches!(parser_name, "typescript" | "tsx") {
            return self.download_typescript_queries(&client, parser_name).await;
        }

        // Try master then main — official tree-sitter repos use master, some community
        // repos use main.
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

    /// Downloads combined JavaScript + TypeScript queries.
    ///
    /// The TypeScript tree-sitter grammar is a strict superset of JavaScript:
    /// its AST contains all JavaScript node types (comment, string, function…)
    /// plus TypeScript-specific ones (type_identifier, predefined_type…).
    /// The official `typescript/queries/highlights.scm` only captures the
    /// TS-specific additions, so we must prepend the full JavaScript queries
    /// to get complete syntax highlighting.
    async fn download_typescript_queries(
        &self,
        client: &reqwest::Client,
        parser_name: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let queries_path = self.cache_manager.queries_path(parser_name);

        let js_url = self.query_url_for_branch("javascript", "master");
        let ts_url = self.query_url_for_branch(parser_name, "master");

        let js_text: String = match client.get(js_url).send().await {
            Ok(res) => res.text().await.unwrap_or_default(),
            Err(_) => String::new(),
        };

        let ts_text: String = match client.get(&ts_url).send().await {
            Ok(res) => res.text().await.unwrap_or_default(),
            Err(_) => String::new(),
        };

        if js_text.is_empty() && ts_text.is_empty() {
            std::fs::write(&queries_path, "")?;
            eprintln!("⚠️ Could not download queries for {}", parser_name);
            return Ok(());
        }

        let combined = format!(
            "; === javascript base (inherited) ===\n{}\n\n; === typescript ===\n{}",
            js_text.trim_end(),
            ts_text.trim_end()
        );
        std::fs::write(&queries_path, &combined)?;
        println!("✅ Combined JS + TS queries downloaded for {}", parser_name);
        Ok(())
    }

    /// Builds the raw.githubusercontent.com URL for a language's highlight queries,
    /// using the actual GitHub repo from PARSER_REGISTRY.
    /// For alias names not in the registry (e.g. "javascript", "html"), falls back
    /// to the canonical `tree-sitter/tree-sitter-{lang}` pattern.
    fn query_url_for_branch(&self, parser_name: &str, branch: &str) -> String {
        use crate::parser::registry::PARSER_REGISTRY;

        let github_repo = PARSER_REGISTRY
            .iter()
            .find(|e| e.name == parser_name)
            .map(|e| e.github_repo)
            .unwrap_or_else(|| {
                // For standard tree-sitter languages not in the user registry
                // (e.g. "javascript" / "html" resolved from inherits directives)
                // the canonical pattern applies.
                ""  // handled below
            });

        if github_repo.is_empty() {
            format!(
                "https://raw.githubusercontent.com/tree-sitter/tree-sitter-{}/{}/queries/highlights.scm",
                parser_name, branch
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

    async fn download_prebuilt(
        &self,
        parser_name: &str,
        entry: &ParserEntry,
        on_progress: Box<dyn Fn(u64, u64) + Send>,
    ) -> Result<PathBuf, Box<dyn std::error::Error>> {
        let release = self.downloader.get_release_info(entry.github_repo).await?;
        let target = self.get_target_platform();

        let asset = release.assets.iter()
            .find(|a| a.name.contains(&target))
            .ok_or_else(|| format!("No binary available for platform: {}", target))?;

        let temp_dir = tempfile::tempdir()?;
        let temp_path = temp_dir.path().join(&asset.name);

        self.downloader.download_binary(
            &asset.browser_download_url,
            &temp_path,
            on_progress,
        ).await?;

        // Validate binary format
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
            let perms = std::fs::Permissions::from_mode(0o755);
            std::fs::set_permissions(&final_path, perms)?;
        }

        // Save metadata
        self.save_parser_metadata(parser_name, entry)?;

        println!("✅ {} downloaded successfully", parser_name);
        Ok(final_path)
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
