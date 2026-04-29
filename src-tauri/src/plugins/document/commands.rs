// plugins/document/commands.rs
//
// Phase 1-3 Tauri command layer for document management.
// Bridges the frontend ↔ DocumentManager ↔ HighlightEngine pipeline.
//
// Flow:
//   1. open_document  → creates DocumentState (rope + parser + AST + query)
//   2. apply_text_edit → incremental reparse (O(changed region))
//   3. get_document_tokens → QueryCursor on stored AST for visible lines
//   4. close_document → removes document from manager

use std::sync::Mutex;
use tauri::State;
use tree_sitter::{Query, WasmStore};

use crate::document::DocumentManager;
use crate::highlight::{get_highlight_tokens, TokenSpan};
use crate::shared::dynamic_parser::REGISTRY;

// ── Phase 1: open document ────────────────────────────────────────────────────

/// Opens a document in the DocumentManager.
/// Loads the WASM parser for `language` (if installed) so the document gets a
/// live syntax tree from the start. Returns a DocumentId the frontend must
/// keep to reference this document in subsequent calls.
#[tauri::command]
pub fn open_document(
    path: String,
    content: String,
    language: String,
    manager: State<Mutex<DocumentManager>>,
) -> Result<usize, String> {
    let (lang_opt, query_opt) = load_language_and_query(&language);

    let mut mgr = manager.lock().map_err(|_| "DocumentManager lock poisoned".to_string())?;
    let id = mgr.open_document(path, content, language, lang_opt, query_opt);
    Ok(id)
}

// ── Phase 2: incremental edit ─────────────────────────────────────────────────

/// Applies a text edit and returns the new document version.
/// The edit must be expressed in byte offsets (not char offsets) so tree-sitter
/// can perform an O(changed region) incremental reparse.
#[tauri::command]
pub fn apply_text_edit(
    doc_id: usize,
    start_byte: usize,
    old_end_byte: usize,
    new_end_byte: usize,
    inserted_text: String,
    manager: State<Mutex<DocumentManager>>,
) -> Result<usize, String> {
    let mgr = manager.lock().map_err(|_| "DocumentManager lock poisoned".to_string())?;
    mgr.edit_document(doc_id, start_byte, old_end_byte, new_end_byte, &inserted_text)
}

// ── Phase 3: highlight tokens for visible range ───────────────────────────────

/// Returns syntax tokens for the visible line range [start_line, end_line].
/// Only nodes whose range overlaps the requested lines are included, making
/// this efficient for large files when combined with virtual scrolling.
#[tauri::command]
pub fn get_document_tokens(
    doc_id: usize,
    start_line: usize,
    end_line: usize,
    manager: State<Mutex<DocumentManager>>,
) -> Result<Vec<TokenSpan>, String> {
    // Briefly lock the manager to clone the Arc, then release it before
    // locking the document — avoids holding two locks simultaneously.
    let doc_arc = {
        let mgr = manager.lock().map_err(|_| "DocumentManager lock poisoned".to_string())?;
        mgr.get_document(doc_id)
            .ok_or_else(|| format!("Document {} not found", doc_id))?
    };
    let doc = doc_arc.lock().map_err(|_| "DocumentState lock poisoned".to_string())?;
    Ok(get_highlight_tokens(&doc, start_line, end_line))
}

// ── Document lifecycle ────────────────────────────────────────────────────────

#[tauri::command]
pub fn close_document(
    doc_id: usize,
    manager: State<Mutex<DocumentManager>>,
) -> Result<(), String> {
    let mut mgr = manager.lock().map_err(|_| "DocumentManager lock poisoned".to_string())?;
    mgr.close_document(doc_id);
    Ok(())
}

// ── Internal helper ───────────────────────────────────────────────────────────

/// Tries to load the WASM language and compile its highlight query.
/// Returns (None, None) if the parser is not installed — the document will
/// still open but without syntax tree or highlighting.
fn load_language_and_query(language: &str) -> (Option<tree_sitter::Language>, Option<Query>) {
    let wasm_path = REGISTRY.get_parser_lib_path(language);
    if !wasm_path.exists() {
        return (None, None);
    }

    let wasm_bytes = match std::fs::read(&wasm_path) {
        Ok(b) => b,
        Err(_) => return (None, None),
    };

    let mut store = match WasmStore::new(&REGISTRY.wasm_engine) {
        Ok(s) => s,
        Err(_) => return (None, None),
    };

    let lang = match store.load_language(language, &wasm_bytes) {
        Ok(l) => l,
        Err(_) => return (None, None),
    };

    // Compile the highlight query from the installed .scm file
    let queries_path = REGISTRY.get_queries_path(language);
    let query_opt = if queries_path.exists() {
        std::fs::read_to_string(&queries_path)
            .ok()
            .and_then(|src| Query::new(&lang, &src).ok())
    } else {
        None
    };

    (Some(lang), query_opt)
}
