// src-tauri/src/document/mod.rs

use ropey::Rope;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tree_sitter::{InputEdit, Language, Parser, Point, Query, Tree};

pub type DocumentId = usize;

/// Internal state of a single open document.
/// Owns the rope buffer, tree-sitter parser (with its WasmStore), syntax tree,
/// and the compiled highlight query. Version is incremented on every edit so the
/// frontend can detect desynchronisation.
pub struct DocumentState {
    pub id: DocumentId,
    pub path: String,
    pub buffer: Rope,
    pub syntax_tree: Option<Tree>,
    pub parser: Option<Parser>,
    pub highlight_query: Option<Query>,
    pub language_id: String,
    pub version: usize,
}

impl DocumentState {
    pub fn new(
        id: DocumentId,
        path: String,
        content: String,
        language_id: String,
        language: Option<Language>,
        highlight_query: Option<Query>,
    ) -> Self {
        let buffer = Rope::from(content.as_str());

        let (parser_opt, syntax_tree_opt) = if let Some(lang) = language {
            let mut p = Parser::new();
            if p.set_language(&lang).is_ok() {
                let tree = p.parse(content.as_bytes(), None);
                (Some(p), tree)
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        DocumentState {
            id,
            path,
            buffer,
            syntax_tree: syntax_tree_opt,
            parser: parser_opt,
            highlight_query,
            language_id,
            version: 0,
        }
    }

    /// Applies a text edit: updates the rope buffer then re-parses the AST
    /// incrementally using the stored parser instance (O(changed region) cost).
    pub fn apply_edit(
        &mut self,
        start_byte: usize,
        old_end_byte: usize,
        new_end_byte: usize,
        inserted_text: &str,
    ) {
        // Capture positions BEFORE modifying the buffer (required by InputEdit)
        let start_position = self.byte_to_point(start_byte);
        let old_end_position = self.byte_to_point(old_end_byte);

        // Update the rope
        let start_char = self.buffer.byte_to_char(start_byte);
        let old_end_char = self.buffer.byte_to_char(old_end_byte);
        self.buffer.remove(start_char..old_end_char);
        self.buffer.insert(start_char, inserted_text);

        // Capture new_end_position AFTER buffer update
        let new_end_position = self.byte_to_point(new_end_byte);

        // Incremental tree-sitter reparse
        if let Some(parser) = &mut self.parser {
            if let Some(mut old_tree) = self.syntax_tree.take() {
                let edit = InputEdit {
                    start_byte,
                    old_end_byte,
                    new_end_byte,
                    start_position,
                    old_end_position,
                    new_end_position,
                };
                old_tree.edit(&edit);

                let content = self.buffer.to_string();
                let new_tree = parser.parse(content.as_bytes(), Some(&old_tree));
                // Keep old tree if reparse fails (shouldn't happen in practice)
                self.syntax_tree = new_tree.or(Some(old_tree));
            }
        }

        self.version += 1;
    }

    pub fn get_content(&self) -> String {
        self.buffer.to_string()
    }

    pub fn byte_to_point(&self, byte_offset: usize) -> Point {
        let (line, col) = self.byte_to_line_col(byte_offset);
        Point { row: line, column: col }
    }

    fn byte_to_line_col(&self, byte_offset: usize) -> (usize, usize) {
        let line_idx = self.buffer.byte_to_line(byte_offset);
        // column must be in bytes, not chars (required by tree-sitter Point)
        let line_start_byte = self.buffer.char_to_byte(self.buffer.line_to_char(line_idx));
        let col_byte = byte_offset.saturating_sub(line_start_byte);
        (line_idx, col_byte)
    }
}

/// Manages all open documents, keyed by DocumentId.
/// Each DocumentState is wrapped in Arc<Mutex<>> so individual documents can be
/// locked independently without blocking the whole manager.
pub struct DocumentManager {
    next_document_id: DocumentId,
    documents: HashMap<DocumentId, Arc<Mutex<DocumentState>>>,
}

impl DocumentManager {
    pub fn new() -> Self {
        DocumentManager {
            next_document_id: 0,
            documents: HashMap::new(),
        }
    }

    /// Creates and stores a new DocumentState. Caller is responsible for building
    /// the parser (with WasmStore attached) and compiling the highlight query
    /// before calling this.
    pub fn open_document(
        &mut self,
        path: String,
        content: String,
        language_id: String,
        language: Option<Language>,
        highlight_query: Option<Query>,
    ) -> DocumentId {
        let id = self.next_document_id;
        self.next_document_id += 1;
        let doc = DocumentState::new(id, path, content, language_id, language, highlight_query);
        self.documents.insert(id, Arc::new(Mutex::new(doc)));
        id
    }

    /// Returns a cloned Arc so the caller can lock the document independently.
    pub fn get_document(&self, id: DocumentId) -> Option<Arc<Mutex<DocumentState>>> {
        self.documents.get(&id).cloned()
    }

    /// Applies an edit and returns the new document version.
    pub fn edit_document(
        &self,
        id: DocumentId,
        start_byte: usize,
        old_end_byte: usize,
        new_end_byte: usize,
        inserted_text: &str,
    ) -> Result<usize, String> {
        let doc_arc = self.documents.get(&id)
            .ok_or_else(|| format!("Document {} not found", id))?;
        let mut doc = doc_arc.lock().unwrap();
        doc.apply_edit(start_byte, old_end_byte, new_end_byte, inserted_text);
        Ok(doc.version)
    }

    pub fn get_content(&self, id: DocumentId) -> Option<String> {
        Some(self.documents.get(&id)?.lock().unwrap().get_content())
    }

    pub fn close_document(&mut self, id: DocumentId) {
        self.documents.remove(&id);
    }
}
