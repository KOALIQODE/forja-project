//! Document commands — open/edit/query/close document lifecycle.
//!
//! Bridges the frontend ↔ [`DocumentManager`] ↔ highlight engine pipeline.
//!
//! Flow:
//! 1. `open_document`  → creates `DocumentState` (rope + parser + AST + query)
//! 2. `apply_text_edit` → incremental reparse (O(changed region))
//! 3. `get_document_tokens` → `QueryCursor` on stored AST for visible lines
//! 4. `close_document` → removes document from manager

use std::sync::Mutex;
use tauri::State;
use tree_sitter::Query;

use crate::application::document_service;
use crate::domain::document::DocumentManager;
use crate::domain::highlight::{get_highlight_tokens, TokenSpan};
use crate::infrastructure::syntax::dynamic_parser::REGISTRY;

// ── open document ─────────────────────────────────────────────────────────────

/// Opens a document in the DocumentManager.
/// Loads the native parser for `language` (if installed) so the document gets a
/// live syntax tree from the start. Returns a DocumentId the frontend must keep.
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

// ── incremental edit ──────────────────────────────────────────────────────────

/// Applies a text edit and returns the new document version.
/// The edit must be expressed in byte offsets (not char offsets) for tree-sitter.
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

// ── highlight tokens for visible range ───────────────────────────────────────

/// Returns syntax tokens for the visible line range [start_line, end_line].
#[tauri::command]
pub fn get_document_tokens(
    doc_id: usize,
    start_line: usize,
    end_line: usize,
    manager: State<Mutex<DocumentManager>>,
) -> Result<Vec<TokenSpan>, String> {
    let doc_arc = {
        let mgr = manager.lock().map_err(|_| "DocumentManager lock poisoned".to_string())?;
        mgr.get_document(doc_id)
            .ok_or_else(|| format!("Document {} not found", doc_id))?
    };
    let doc = doc_arc.lock().map_err(|_| "DocumentState lock poisoned".to_string())?;
    Ok(get_highlight_tokens(&doc, start_line, end_line))
}

// ── lifecycle ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn close_document(
    doc_id: usize,
    manager: State<Mutex<DocumentManager>>,
) -> Result<(), String> {
    let mut mgr = manager.lock().map_err(|_| "DocumentManager lock poisoned".to_string())?;
    mgr.close_document(doc_id);
    Ok(())
}

// ── internal helper ───────────────────────────────────────────────────────────

/// Delegates to [`crate::application::document_service::load_language_and_query`].
///
/// This thin wrapper ensures REGISTRY is initialised before loading, which
/// creates `parsers_dir` as a side-effect (required on first run).
fn load_language_and_query(language: &str) -> (Option<tree_sitter::Language>, Option<Query>) {
    // Side-effect: ensures parsers_dir exists before the loader touches it.
    let _ = REGISTRY.get_config_dir();
    document_service::load_language_and_query(language)
}
