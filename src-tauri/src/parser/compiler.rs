use std::path::{Path, PathBuf};
use std::process::Command;

pub struct ParserCompiler {
    pub cache_dir: PathBuf,
}

#[derive(Debug, thiserror::Error)]
pub enum CompilationError {
    #[error("Download failed: {0}")]
    DownloadFailed(String),
    #[error("Compilation failed: {0}. Is gcc/clang installed?")]
    CompilationFailed(String),
    #[error("Missing dependencies: {0}")]
    MissingDependencies(String),
    #[error("parser.c not found in extracted source: {0}")]
    InvalidSource(String),
}

impl ParserCompiler {
    pub fn new(cache_dir: PathBuf) -> Self {
        ParserCompiler { cache_dir }
    }

    /// Platform-canonical output filename — must match CacheManager::binary_path().
    fn canonical_binary_name() -> &'static str {
        if cfg!(target_os = "windows") { "parser.dll" }
        else if cfg!(target_os = "macos") { "parser.dylib" }
        else { "parser.so" }
    }

    pub fn validate_compilation_environment() -> Result<(), CompilationError> {
        let cc_ok = Command::new("cc").arg("--version").output().is_ok()
            || Command::new("gcc").arg("--version").output().is_ok()
            || Command::new("clang").arg("--version").output().is_ok();
        if !cc_ok {
            return Err(CompilationError::MissingDependencies(
                "No C compiler (cc/gcc/clang) found. Install build-essential (Linux) or Xcode CLI (macOS).".to_string(),
            ));
        }
        Ok(())
    }

    pub async fn compile(
        &self,
        parser_name: &str,
        github_repo: &str,
    ) -> Result<PathBuf, Box<dyn std::error::Error>> {
        println!("🔨 Compiling {parser_name} from {github_repo}");
        Self::validate_compilation_environment()
            .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;

        // ── Download source ZIP ──────────────────────────────────────────────────
        let temp_dir = tempfile::tempdir()?;
        let zip_path = temp_dir.path().join("source.zip");

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .user_agent("Forja-Studio/1.0")
            .build()?;

        let bytes = Self::download_source_zip(&client, github_repo).await?;
        std::fs::write(&zip_path, &bytes)?;

        // ── Extract ──────────────────────────────────────────────────────────────
        let extract_dir = temp_dir.path().join("source");
        std::fs::create_dir_all(&extract_dir)?;
        let zip_file = std::fs::File::open(&zip_path)?;
        zip::ZipArchive::new(zip_file)?.extract(&extract_dir)?;

        // The ZIP always creates one top-level subdirectory (e.g. tree-sitter-rust-master/)
        let project_dir = std::fs::read_dir(&extract_dir)?
            .filter_map(Result::ok)
            .find(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .map(|e| e.path())
            .unwrap_or(extract_dir.clone());

        // ── Locate src/parser.c ─────────────────────────────────────────────────
        // Some repos (e.g. tree-sitter-typescript) nest the grammar in a subdir.
        let src_dir = Self::find_src_dir(&project_dir, parser_name)
            .ok_or_else(|| CompilationError::InvalidSource(
                format!("Could not find src/parser.c under {}", project_dir.display())
            ))?;

        // ── Compile to shared library ────────────────────────────────────────────
        let temp_output = temp_dir.path().join(Self::canonical_binary_name());
        Self::compile_src(&src_dir, &temp_output)?;

        // ── Move to permanent cache ─────────────────────────────────────────────
        let final_dir = self.cache_dir.join("parsers").join(parser_name);
        std::fs::create_dir_all(&final_dir)?;
        let final_path = final_dir.join(Self::canonical_binary_name());
        std::fs::copy(&temp_output, &final_path)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&final_path, std::fs::Permissions::from_mode(0o755))?;
        }

        // ── Extract highlight queries from the same source ZIP ────────────────────
        // This guarantees the queries are always in sync with the compiled grammar.
        // The queries directory lives at:
        //   {project_dir}/queries/highlights.scm               (most repos)
        //   {project_dir}/{parser_name}/queries/highlights.scm  (TypeScript-style)
        let queries_dest = final_dir.join("highlights.scm");
        if let Some(queries_src) = Self::find_queries_file(&project_dir, parser_name) {
            std::fs::copy(&queries_src, &queries_dest)?;
            println!("📋 {} queries extracted from source", parser_name);
        } else {
            eprintln!("⚠️  No queries/highlights.scm found in source for {}", parser_name);
        }

        // ── Record which repo this binary was compiled from ───────────────────────
        // Used by manager.rs to detect grammar repo changes and force recompilation.
        let metadata_dir = self.cache_dir.join("metadata");
        std::fs::create_dir_all(&metadata_dir).ok();
        std::fs::write(metadata_dir.join(format!("{}.json", parser_name)), github_repo).ok();

        println!("✅ {parser_name} compiled → {}", final_path.display());
        Ok(final_path)
    }

    /// Recursively find the `src/` directory that contains `parser.c`.
    /// Handles flat layout (`project/src/parser.c`) and nested layout
    /// (`project/{lang}/src/parser.c`) used by tree-sitter-typescript.
    fn find_src_dir(project_dir: &Path, parser_name: &str) -> Option<PathBuf> {
        // 1. Direct: project/src/parser.c
        let direct = project_dir.join("src");
        if direct.join("parser.c").exists() {
            return Some(direct);
        }

        // 2. Named subdir: project/{parser_name}/src/parser.c
        let named = project_dir.join(parser_name).join("src");
        if named.join("parser.c").exists() {
            return Some(named);
        }

        // 3. Scan one level of subdirs
        if let Ok(entries) = std::fs::read_dir(project_dir) {
            for entry in entries.filter_map(Result::ok) {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let candidate = entry.path().join("src");
                    if candidate.join("parser.c").exists() {
                        return Some(candidate);
                    }
                }
            }
        }

        None
    }

    /// Locate `queries/highlights.scm` inside the extracted repo directory.
    /// Mirrors the same layout detection as `find_src_dir`.
    fn find_queries_file(project_dir: &Path, parser_name: &str) -> Option<PathBuf> {
        // 1. Direct: project/queries/highlights.scm
        let direct = project_dir.join("queries").join("highlights.scm");
        if direct.exists() {
            return Some(direct);
        }

        // 2. Named subdir: project/{parser_name}/queries/highlights.scm  (TypeScript)
        let named = project_dir.join(parser_name).join("queries").join("highlights.scm");
        if named.exists() {
            return Some(named);
        }

        // 3. Scan one level of subdirs
        if let Ok(entries) = std::fs::read_dir(project_dir) {
            for entry in entries.filter_map(Result::ok) {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let candidate = entry.path().join("queries").join("highlights.scm");
                    if candidate.exists() {
                        return Some(candidate);
                    }
                }
            }
        }

        None
    }

    /// Invoke the system C/C++ compiler to produce a shared library.
    /// Uses `c++` when a C++ scanner is present; `cc` for pure-C parsers.
    fn compile_src(src_dir: &Path, output: &Path) -> Result<(), CompilationError> {
        let parser_c  = src_dir.join("parser.c");
        let scanner_c  = src_dir.join("scanner.c");
        let scanner_cc = src_dir.join("scanner.cc");   // C++ scanner (e.g. rust, svelte)

        let has_cpp_scanner = scanner_cc.exists();

        // Pick compiler
        let compiler = if has_cpp_scanner {
            // Need a C++ compiler for the C++ scanner
            if Command::new("c++").arg("--version").output().is_ok() { "c++" }
            else if Command::new("g++").arg("--version").output().is_ok() { "g++" }
            else if Command::new("clang++").arg("--version").output().is_ok() { "clang++" }
            else {
                return Err(CompilationError::MissingDependencies(
                    "No C++ compiler found (c++/g++/clang++). Install build-essential.".to_string(),
                ));
            }
        } else {
            if Command::new("cc").arg("--version").output().is_ok() { "cc" }
            else if Command::new("gcc").arg("--version").output().is_ok() { "gcc" }
            else { "clang" }
        };

        let mut args: Vec<std::ffi::OsString> = vec![
            "-shared".into(),
            "-fPIC".into(),
            "-O2".into(),
            format!("-I{}", src_dir.display()).into(),
            parser_c.as_os_str().into(),
        ];

        if scanner_c.exists()  { args.push(scanner_c.as_os_str().into()); }
        if scanner_cc.exists() { args.push(scanner_cc.as_os_str().into()); }

        args.push("-o".into());
        args.push(output.as_os_str().into());

        // Note: intentionally NOT using -fvisibility=hidden here.
        // Older tree-sitter grammars (pre-0.20 / no TS_PUBLIC macro) don't annotate
        // their entry point with __attribute__((visibility("default"))), so hidden
        // visibility would make tree_sitter_{lang} unreachable at runtime.
        // The only symbol the loader needs is tree_sitter_{lang}; leaving it
        // at default visibility costs nothing meaningful.
        #[cfg(target_os = "windows")]
        args.push("-DTREE_SITTER_HIDE_SYMBOLS".into());

        println!("⚙  {compiler} {}", args.iter().map(|a| a.to_string_lossy()).collect::<Vec<_>>().join(" "));

        let status = Command::new(compiler)
            .args(&args)
            .status()
            .map_err(|e| CompilationError::CompilationFailed(e.to_string()))?;

        if !status.success() {
            return Err(CompilationError::CompilationFailed(
                format!("Compiler exited with status {status}"),
            ));
        }

        // Verify ELF/Mach-O/PE magic bytes
        let mut file = std::fs::File::open(output)
            .map_err(|e| CompilationError::CompilationFailed(e.to_string()))?;
        let mut magic = [0u8; 4];
        std::io::Read::read_exact(&mut file, &mut magic)
            .map_err(|e| CompilationError::CompilationFailed(e.to_string()))?;
        #[cfg(target_os = "linux")]
        let valid = magic == [0x7f, b'E', b'L', b'F'];
        #[cfg(target_os = "macos")]
        let valid = magic[0] == 0xfe && magic[1] == 0xed && magic[2] == 0xfa;
        #[cfg(target_os = "windows")]
        let valid = magic[0] == 0x4d && magic[1] == 0x5a;
        if !valid {
            return Err(CompilationError::CompilationFailed(
                "Output binary has invalid magic bytes".to_string(),
            ));
        }

        Ok(())
    }

    async fn download_source_zip(
        client: &reqwest::Client,
        github_repo: &str,
    ) -> Result<bytes::Bytes, CompilationError> {
        for branch in &["master", "main"] {
            let url = format!(
                "https://github.com/{}/archive/refs/heads/{}.zip",
                github_repo, branch
            );
            if let Ok(resp) = client.get(&url).send().await {
                if resp.status().is_success() {
                    return resp.bytes().await
                        .map_err(|e| CompilationError::DownloadFailed(e.to_string()));
                }
            }
        }
        Err(CompilationError::DownloadFailed(
            format!("Could not download source ZIP for {} (tried master/main)", github_repo),
        ))
    }
}
