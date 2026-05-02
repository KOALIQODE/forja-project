//! LSP client — JSON-RPC over stdin/stdout process management.
//!
//! [`LspClientManager`] spawns one language server process per language and
//! manages the full LSP document lifecycle (open/change/close). Diagnostics
//! pushed by the server are forwarded to the frontend via Tauri events.
//!
//! This is an outbound adapter in the Hexagonal Architecture.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{Child, ChildStdin, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

// ── LSP JSON-RPC framing ──────────────────────────────────────────────────────

fn write_lsp(stdin: &mut ChildStdin, msg: &Value) -> std::io::Result<()> {
    let body = serde_json::to_string(msg)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let header = format!("Content-Length: {}\r\n\r\n", body.len());
    stdin.write_all(header.as_bytes())?;
    stdin.write_all(body.as_bytes())?;
    stdin.flush()
}

fn read_lsp(reader: &mut impl Read) -> Option<Value> {
    let mut header_bytes: Vec<u8> = Vec::with_capacity(128);
    let mut byte = [0u8; 1];

    loop {
        reader.read_exact(&mut byte).ok()?;
        header_bytes.push(byte[0]);
        if header_bytes.ends_with(b"\r\n\r\n") {
            break;
        }
        if header_bytes.len() > 8192 {
            return None;
        }
    }

    let header = String::from_utf8_lossy(&header_bytes);
    let content_length: usize = header
        .lines()
        .find(|l| l.to_ascii_lowercase().starts_with("content-length:"))?
        .split(':')
        .nth(1)?
        .trim()
        .parse()
        .ok()?;

    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body).ok()?;
    serde_json::from_slice(&body).ok()
}

// ── Session ───────────────────────────────────────────────────────────────────

struct LspSession {
    child: Child,
    stdin: ChildStdin,
    stop_flag: Arc<AtomicBool>,
}

impl LspSession {
    fn send(&mut self, msg: &Value) -> Result<(), String> {
        write_lsp(&mut self.stdin, msg).map_err(|e| format!("LSP write: {e}"))
    }
}

impl Drop for LspSession {
    fn drop(&mut self) {
        self.stop_flag.store(true, Ordering::Relaxed);
        let _ = self.child.kill();
    }
}

// ── Manager ───────────────────────────────────────────────────────────────────

/// Manages one LSP session per language, handling spawn, initialize, and document sync.
pub struct LspClientManager {
    sessions: HashMap<String, LspSession>,
}

impl LspClientManager {
    pub fn new() -> Self {
        LspClientManager {
            sessions: HashMap::new(),
        }
    }

    /// Ensure an LSP session is running for `language`. No-op if already running.
    pub fn ensure_session(&mut self, language: &str, app: AppHandle) -> Result<(), String> {
        if self.sessions.contains_key(language) {
            return Ok(());
        }

        let binary = binary_for_language(language)
            .ok_or_else(|| format!("No LSP server configured for: {language}"))?;

        let mut child = std::process::Command::new(binary)
            .arg("--stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn '{binary}': {e}"))?;

        let mut stdin = child.stdin.take().ok_or("stdin unavailable")?;
        let stdout = child.stdout.take().ok_or("stdout unavailable")?;

        let init = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "processId": std::process::id(),
                "clientInfo": { "name": "forja-studio", "version": "0.1.0" },
                "rootUri": null,
                "capabilities": {
                    "textDocument": {
                        "publishDiagnostics": {
                            "relatedInformation": false,
                            "versionSupport": false,
                            "codeDescriptionSupport": false
                        }
                    }
                },
                "trace": "off"
            }
        });
        write_lsp(&mut stdin, &init).map_err(|e| format!("initialize send: {e}"))?;

        let initialized = json!({ "jsonrpc": "2.0", "method": "initialized", "params": {} });
        write_lsp(&mut stdin, &initialized).map_err(|e| format!("initialized send: {e}"))?;

        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_clone = Arc::clone(&stop_flag);
        let lang_clone = language.to_string();

        thread::spawn(move || {
            let mut reader = std::io::BufReader::new(stdout);
            while !stop_clone.load(Ordering::Relaxed) {
                let msg = match read_lsp(&mut reader) {
                    Some(m) => m,
                    None => break,
                };
                let method = msg.get("method").and_then(|m| m.as_str()).unwrap_or("");
                if method == "textDocument/publishDiagnostics" {
                    if let Some(params) = msg.get("params") {
                        let uri = params
                            .get("uri")
                            .and_then(|u| u.as_str())
                            .unwrap_or("")
                            .to_string();
                        let diags = params
                            .get("diagnostics")
                            .cloned()
                            .unwrap_or(json!([]));
                        let _ = app.emit(
                            "lsp-diagnostics",
                            json!({ "language": lang_clone, "uri": uri, "diagnostics": diags }),
                        );
                    }
                }
            }
        });

        self.sessions.insert(
            language.to_string(),
            LspSession { child, stdin, stop_flag },
        );
        Ok(())
    }

    pub fn did_open(&mut self, language: &str, uri: &str, text: &str) -> Result<(), String> {
        let session = self
            .sessions
            .get_mut(language)
            .ok_or_else(|| format!("No session for {language}"))?;

        session.send(&json!({
            "jsonrpc": "2.0",
            "method": "textDocument/didOpen",
            "params": {
                "textDocument": {
                    "uri": uri,
                    "languageId": language,
                    "version": 1,
                    "text": text
                }
            }
        }))
    }

    pub fn did_change(
        &mut self,
        language: &str,
        uri: &str,
        version: u64,
        text: &str,
    ) -> Result<(), String> {
        let session = self
            .sessions
            .get_mut(language)
            .ok_or_else(|| format!("No session for {language}"))?;

        session.send(&json!({
            "jsonrpc": "2.0",
            "method": "textDocument/didChange",
            "params": {
                "textDocument": { "uri": uri, "version": version },
                "contentChanges": [{ "text": text }]
            }
        }))
    }

    pub fn did_close(&mut self, language: &str, uri: &str) -> Result<(), String> {
        if let Some(session) = self.sessions.get_mut(language) {
            let _ = session.send(&json!({
                "jsonrpc": "2.0",
                "method": "textDocument/didClose",
                "params": { "textDocument": { "uri": uri } }
            }));
        }
        Ok(())
    }

    #[allow(dead_code)]
    pub fn stop_session(&mut self, language: &str) {
        self.sessions.remove(language);
    }
}

fn binary_for_language(language: &str) -> Option<&'static str> {
    match language {
        "json" => Some("vscode-json-language-server"),
        _ => None,
    }
}
