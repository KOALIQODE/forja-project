use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LspServer {
    pub id: String,
    pub name: String,
    pub language: String,
    pub description: String,
    /// "npm" | "pip" | "cargo" | "go" | "rustup" | "manual"
    pub method: String,
    /// Binary name to probe in PATH
    pub binary: String,
    pub installed: bool,
    pub version: Option<String>,
}

// ── Registry ──────────────────────────────────────────────────────────────────

struct LspDef {
    id: &'static str,
    name: &'static str,
    language: &'static str,
    description: &'static str,
    method: &'static str,
    binary: &'static str,
    /// (program, args[])
    install: Option<(&'static str, &'static [&'static str])>,
}

fn registry() -> Vec<LspDef> {
    vec![
        LspDef {
            id: "rust-analyzer",
            name: "rust-analyzer",
            language: "Rust",
            description: "Official Rust language server — completions, types, inlay hints",
            method: "rustup",
            binary: "rust-analyzer",
            install: Some(("rustup", &["component", "add", "rust-analyzer"])),
        },
        LspDef {
            id: "typescript-language-server",
            name: "typescript-language-server",
            language: "TypeScript / JavaScript",
            description: "TS/JS language server over tsserver with full IDE features",
            method: "npm",
            binary: "typescript-language-server",
            install: Some(("npm", &["install", "-g", "typescript", "typescript-language-server"])),
        },
        LspDef {
            id: "pyright",
            name: "pyright",
            language: "Python",
            description: "Microsoft's fast static type checker and language server",
            method: "npm",
            binary: "pyright",
            install: Some(("npm", &["install", "-g", "pyright"])),
        },
        LspDef {
            id: "pylsp",
            name: "python-lsp-server",
            language: "Python (pylsp)",
            description: "Community fork of python-language-server with plugin support",
            method: "pip",
            binary: "pylsp",
            install: Some(("pip3", &["install", "python-lsp-server[all]"])),
        },
        LspDef {
            id: "gopls",
            name: "gopls",
            language: "Go",
            description: "Official Go language server from the Go team",
            method: "go",
            binary: "gopls",
            install: Some(("go", &["install", "golang.org/x/tools/gopls@latest"])),
        },
        LspDef {
            id: "svelte-language-server",
            name: "svelte-language-server",
            language: "Svelte",
            description: "Svelte language server with component-aware completions",
            method: "npm",
            binary: "svelteserver",
            install: Some(("npm", &["install", "-g", "svelte-language-server"])),
        },
        LspDef {
            id: "clangd",
            name: "clangd",
            language: "C / C++",
            description: "LLVM-based C/C++ language server — requires system install",
            method: "manual",
            binary: "clangd",
            install: None,
        },
        LspDef {
            id: "bash-language-server",
            name: "bash-language-server",
            language: "Bash",
            description: "Language server for Bash/Shell scripts",
            method: "npm",
            binary: "bash-language-server",
            install: Some(("npm", &["install", "-g", "bash-language-server"])),
        },
        LspDef {
            id: "yaml-language-server",
            name: "yaml-language-server",
            language: "YAML",
            description: "YAML language server with JSON Schema validation",
            method: "npm",
            binary: "yaml-language-server",
            install: Some(("npm", &["install", "-g", "yaml-language-server"])),
        },
        LspDef {
            id: "taplo",
            name: "taplo",
            language: "TOML",
            description: "TOML toolkit with a language server and formatter",
            method: "cargo",
            binary: "taplo",
            install: Some(("cargo", &["install", "taplo-cli", "--locked"])),
        },
        LspDef {
            id: "vscode-css-language-server",
            name: "vscode-css-language-server",
            language: "CSS / SCSS / Less",
            description: "VS Code's CSS/SCSS/Less language server",
            method: "npm",
            binary: "vscode-css-language-server",
            install: Some(("npm", &["install", "-g", "vscode-langservers-extracted"])),
        },
        LspDef {
            id: "vscode-html-language-server",
            name: "vscode-html-language-server",
            language: "HTML",
            description: "VS Code's HTML language server",
            method: "npm",
            binary: "vscode-html-language-server",
            install: Some(("npm", &["install", "-g", "vscode-langservers-extracted"])),
        },
        LspDef {
            id: "lua-language-server",
            name: "lua-language-server",
            language: "Lua",
            description: "Feature-rich Lua language server — requires manual binary install",
            method: "manual",
            binary: "lua-language-server",
            install: None,
        },
        LspDef {
            id: "jdtls",
            name: "jdtls",
            language: "Java",
            description: "Eclipse JDT language server — requires manual binary install",
            method: "manual",
            binary: "jdtls",
            install: None,
        },
    ]
}

// ── PATH probe ────────────────────────────────────────────────────────────────

fn is_in_path(binary: &str) -> bool {
    let Ok(path_var) = std::env::var("PATH") else {
        return false;
    };
    std::env::split_paths(&path_var).any(|dir| {
        let candidate = dir.join(binary);
        if candidate.is_file() {
            return true;
        }
        #[cfg(windows)]
        {
            let candidate_exe = dir.join(format!("{}.exe", binary));
            if candidate_exe.is_file() {
                return true;
            }
        }
        false
    })
}

fn read_version(binary: &str) -> Option<String> {
    let output = std::process::Command::new(binary)
        .arg("--version")
        .output()
        .ok()?;
    let raw = String::from_utf8_lossy(&output.stdout).to_string();
    let line = raw.lines().next()?.to_string();
    Some(line)
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_lsp_servers() -> Result<Vec<LspServer>, String> {
    let servers = registry()
        .into_iter()
        .map(|def| {
            let installed = is_in_path(def.binary);
            let version = if installed { read_version(def.binary) } else { None };
            LspServer {
                id: def.id.to_string(),
                name: def.name.to_string(),
                language: def.language.to_string(),
                description: def.description.to_string(),
                method: def.method.to_string(),
                binary: def.binary.to_string(),
                installed,
                version,
            }
        })
        .collect();
    Ok(servers)
}

#[tauri::command]
pub async fn install_lsp_server(app: AppHandle, id: String) -> Result<(), String> {
    let def = registry()
        .into_iter()
        .find(|d| d.id == id)
        .ok_or_else(|| format!("Unknown LSP server: {}", id))?;

    let (program, args) = def
        .install
        .ok_or_else(|| format!("{} requires manual installation — see documentation", def.name))?;

    let _ = app.emit("lsp-status", (&id, format!("Running {} install…", program)));

    let output = tokio::process::Command::new(program)
        .args(args)
        .output()
        .await
        .map_err(|e| {
            let msg = format!("Failed to run {}: {}", program, e);
            let _ = app.emit("lsp-status", (&id, msg.clone()));
            msg
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let msg = format!(
            "Install failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            stderr.lines().last().unwrap_or("unknown error")
        );
        let _ = app.emit("lsp-status", (&id, msg.clone()));
        return Err(msg);
    }

    let _ = app.emit("lsp-ready", &id);
    Ok(())
}
