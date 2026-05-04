//! Build-time CLI tool that compiles every tree-sitter parser in PARSER_REGISTRY
//! and writes the resulting shared libraries to an output directory.
//!
//! Usage (called by the GitHub Actions workflow):
//!   cargo run --bin build-parsers --release -- --platform linux-x86_64 --out-dir ../dist
//!
//! The tool produces files named: `{parser}-{platform}.{ext}`
//! e.g.  rust-linux-x86_64.so,  css-macos-arm64.dylib,  json-windows-x86_64.dll

use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

// Re-use the shared registry and compiler logic from the main crate.
use forja_backend::infrastructure::parser::registry::PARSER_REGISTRY;

#[tokio::main]
async fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let platform = flag_value(&args, "--platform").unwrap_or_else(|| current_platform());
    let out_dir_str = flag_value(&args, "--out-dir").unwrap_or_else(|| "dist".to_string());

    let out_dir = PathBuf::from(&out_dir_str);
    std::fs::create_dir_all(&out_dir).expect("failed to create output directory");

    println!("🏗  Building parsers for platform: {platform}");
    println!("📁 Output directory: {}", out_dir.display());
    println!();

    let ext = platform_ext();
    let mut success = 0usize;
    let mut failed: Vec<String> = Vec::new();

    for entry in PARSER_REGISTRY {
        // hidden parsers (e.g. markdown_inline) are companion parsers —
        // they're built as a side-effect of the parent (markdown) below.
        if entry.hidden {
            continue;
        }

        let dest = out_dir.join(format!("{}-{}.{}", entry.name, platform, ext));

        // Skip if already built (allows resuming interrupted runs)
        if dest.exists() {
            println!("⏭  {} already built, skipping", entry.name);
            success += 1;
            continue;
        }

        print!("🔨 Compiling {} ... ", entry.name);
        match compile_parser(entry.name, entry.github_repo, entry.subdir, &dest).await {
            Ok(()) => {
                println!("✅");
                success += 1;

                // Build the companion markdown_inline when markdown succeeds
                if entry.name == "markdown" {
                    let inline_dest =
                        out_dir.join(format!("markdown_inline-{}.{}", platform, ext));
                    print!("🔨 Compiling markdown_inline ... ");
                    match compile_parser(
                        "markdown_inline",
                        "tree-sitter-grammars/tree-sitter-markdown",
                        Some("tree-sitter-markdown-inline"),
                        &inline_dest,
                    )
                    .await
                    {
                        Ok(()) => println!("✅"),
                        Err(e) => println!("❌  {e}"),
                    }
                }
            }
            Err(e) => {
                println!("❌  {e}");
                failed.push(entry.name.to_string());
            }
        }
    }

    println!();
    println!("────────────────────────────────────────────────");
    println!("✅ Built:  {success}");
    if !failed.is_empty() {
        println!("❌ Failed: {}", failed.join(", "));
        return ExitCode::FAILURE;
    }
    println!("────────────────────────────────────────────────");

    ExitCode::SUCCESS
}

async fn compile_parser(
    name: &str,
    github_repo: &str,
    subdir: Option<&str>,
    dest: &Path,
) -> Result<(), String> {
    let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let zip_path = temp_dir.path().join("source.zip");

    // Download source ZIP (tries main then master)
    download_source_zip(github_repo, &zip_path)
        .await
        .map_err(|e| format!("download failed: {e}"))?;

    // Extract
    let extract_dir = temp_dir.path().join("source");
    std::fs::create_dir_all(&extract_dir).map_err(|e| e.to_string())?;
    let zip_file = std::fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    zip::ZipArchive::new(zip_file)
        .map_err(|e| e.to_string())?
        .extract(&extract_dir)
        .map_err(|e| e.to_string())?;

    // Locate the top-level project directory inside the ZIP
    let project_dir = std::fs::read_dir(&extract_dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .find(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.path())
        .ok_or("empty archive")?;

    // Locate src/parser.c
    let src_dir = find_src_dir(&project_dir, name, subdir)
        .ok_or_else(|| format!("src/parser.c not found under {}", project_dir.display()))?;

    // Compile to shared library
    compile_src(&src_dir, dest)?;

    Ok(())
}

async fn download_source_zip(github_repo: &str, dest: &Path) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .user_agent("Forja-Studio-BuildTool/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    for branch in &["main", "master"] {
        let url = format!(
            "https://github.com/{}/archive/refs/heads/{}.zip",
            github_repo, branch
        );
        if let Ok(resp) = client.get(&url).send().await {
            if resp.status().is_success() {
                let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
                std::fs::write(dest, &bytes).map_err(|e| e.to_string())?;
                return Ok(());
            }
        }
    }
    Err(format!("could not download source for {github_repo} (tried main/master)"))
}

fn find_src_dir(project_dir: &Path, name: &str, subdir: Option<&str>) -> Option<PathBuf> {
    if let Some(sub) = subdir {
        let p = project_dir.join(sub).join("src");
        if p.join("parser.c").exists() {
            return Some(p);
        }
    }
    let direct = project_dir.join("src");
    if direct.join("parser.c").exists() {
        return Some(direct);
    }
    let named = project_dir.join(name).join("src");
    if named.join("parser.c").exists() {
        return Some(named);
    }
    let prefixed = project_dir.join(format!("tree-sitter-{name}")).join("src");
    if prefixed.join("parser.c").exists() {
        return Some(prefixed);
    }
    // Scan one level of subdirs
    if let Ok(entries) = std::fs::read_dir(project_dir) {
        let mut dirs: Vec<PathBuf> = entries
            .filter_map(Result::ok)
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .map(|e| e.path())
            .collect();
        dirs.sort();
        for dir in dirs {
            let candidate = dir.join("src");
            if candidate.join("parser.c").exists() {
                return Some(candidate);
            }
        }
    }
    None
}

fn compile_src(src_dir: &Path, output: &Path) -> Result<(), String> {
    let parser_c = src_dir.join("parser.c");
    let scanner_c = src_dir.join("scanner.c");
    let scanner_cc = src_dir.join("scanner.cc");
    let has_cpp = scanner_cc.exists();

    let compiler = if has_cpp {
        ["c++", "g++", "clang++"]
            .iter()
            .find(|&&c| Command::new(c).arg("--version").output().is_ok())
            .copied()
            .ok_or("no C++ compiler found (c++/g++/clang++)")?
    } else {
        ["cc", "gcc", "clang"]
            .iter()
            .find(|&&c| Command::new(c).arg("--version").output().is_ok())
            .copied()
            .ok_or("no C compiler found (cc/gcc/clang)")?
    };

    let mut cmd = Command::new(compiler);
    cmd.args(["-shared", "-fPIC", "-O2"]);
    cmd.arg(format!("-I{}", src_dir.display()));
    cmd.arg(&parser_c);
    if scanner_c.exists() {
        cmd.arg(&scanner_c);
    }
    if scanner_cc.exists() {
        cmd.arg(&scanner_cc);
    }
    cmd.args(["-o", &output.to_string_lossy()]);

    let status = cmd.status().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("compiler exited with {status}"));
    }

    Ok(())
}

fn current_platform() -> String {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    match (os, arch) {
        ("linux", "x86_64") => "linux-x86_64".to_string(),
        ("macos", "x86_64") => "macos-x86_64".to_string(),
        ("macos", "aarch64") => "macos-arm64".to_string(),
        ("windows", "x86_64") => "windows-x86_64".to_string(),
        _ => format!("{os}-{arch}"),
    }
}

fn platform_ext() -> &'static str {
    if cfg!(target_os = "windows") { "dll" }
    else if cfg!(target_os = "macos") { "dylib" }
    else { "so" }
}

fn flag_value(args: &[String], flag: &str) -> Option<String> {
    args.windows(2)
        .find(|w| w[0] == flag)
        .map(|w| w[1].clone())
}
