//! Highlight domain logic — AST → token spans for a visible line range.
//!
//! Uses tree-sitter's `QueryCursor` on the document's stored syntax tree.
//! Compatible with both native and WASM parsers since it only needs the `Tree` + `Query`.
//!
//! This module is pure logic: no filesystem I/O, no Tauri state, no async.

use serde::{Serialize, Deserialize};
use streaming_iterator::StreamingIterator;
use tree_sitter::QueryCursor;

use crate::domain::document::DocumentState;

/// A single syntax-highlighted token span, expressed in both byte and line/column coordinates.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenSpan {
    pub start_byte: usize,
    pub end_byte: usize,
    pub start_line: usize,
    pub start_col: usize,
    pub end_line: usize,
    pub end_col: usize,
    pub highlight_name: String,
}

/// Returns syntax tokens for the visible line range [start_line, end_line].
/// Returns an empty vec if the document has no parsed tree or no highlight query.
pub fn get_highlight_tokens(
    doc: &DocumentState,
    start_line: usize,
    end_line: usize,
) -> Vec<TokenSpan> {
    let (tree, query) = match (&doc.syntax_tree, &doc.highlight_query) {
        (Some(t), Some(q)) => (t, q),
        _ => return vec![],
    };

    let content = doc.buffer.to_string();
    let content_bytes = content.as_bytes();

    // Compute byte range for the visible lines to limit QueryCursor scope
    let line_count = doc.buffer.len_lines();
    let start_byte = doc.buffer
        .char_to_byte(doc.buffer.line_to_char(start_line.min(line_count.saturating_sub(1))));
    let end_byte = if end_line + 1 < line_count {
        doc.buffer.char_to_byte(doc.buffer.line_to_char(end_line + 1))
    } else {
        content.len()
    };

    let mut cursor = QueryCursor::new();
    cursor.set_byte_range(start_byte..end_byte);

    let mut spans = Vec::new();
    let mut matches = cursor.matches(query, tree.root_node(), content_bytes);

    while let Some(m) = matches.next() {
        for capture in m.captures {
            let node = capture.node;
            let node_start = node.start_position();
            let node_end = node.end_position();

            // Skip nodes fully outside the requested range
            if node_start.row > end_line || node_end.row < start_line {
                continue;
            }

            let name = query.capture_names()[capture.index as usize].to_string();
            spans.push(TokenSpan {
                start_byte: node.start_byte(),
                end_byte: node.end_byte(),
                start_line: node_start.row,
                start_col: node_start.column,
                end_line: node_end.row,
                end_col: node_end.column,
                highlight_name: name,
            });
        }
    }

    spans
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::document::DocumentState;

    #[test]
    fn get_highlight_tokens_empty_without_tree() {
        let doc = DocumentState::new(
            0,
            "/test.rs".into(),
            "let x = 1;".into(),
            "rust".into(),
            None,  // no language → no tree
            None,  // no query
        );
        let tokens = get_highlight_tokens(&doc, 0, 0);
        assert!(tokens.is_empty(), "Expected no tokens when parser is absent");
    }
}
