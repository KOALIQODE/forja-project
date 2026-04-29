use anyhow::{Context, Result};
use dashmap::DashMap;
use lazy_static::lazy_static;
use std::sync::Arc;
use tree_sitter::{Language, Parser, Query, QueryCursor};
use streaming_iterator::StreamingIterator;

use crate::shared::dynamic_parser::REGISTRY;
use crate::shared::models::{SyntaxHighlight, Token, TokenType};
use crate::shared::native_languages::{get_native_highlights, get_native_language};

// ── Global query cache ─────────────────────────────────────────────────────────
// `Query::new()` compiles tree-sitter patterns — expensive for large grammars
// (JS = 200+ patterns, ~20-50ms).  Compile once and reuse the Arc<Query>.
lazy_static! {
    static ref QUERY_CACHE: DashMap<String, Arc<Query>> = DashMap::new();
}

fn get_or_compile_query(key: &str, lang: &Language, src: &str) -> Result<Arc<Query>> {
    if let Some(q) = QUERY_CACHE.get(key) {
        return Ok(q.clone());
    }
    let q = Arc::new(Query::new(lang, src).with_context(|| format!("compile query '{}'", key))?);
    QUERY_CACHE.insert(key.to_string(), q.clone());
    Ok(q)
}

pub struct SyntaxHighlighter;

impl SyntaxHighlighter {
    pub fn new() -> Result<Self> {
        Ok(SyntaxHighlighter)
    }

    pub fn highlight(&self, content: &str, language_name: &str) -> Result<SyntaxHighlight> {
        // Svelte needs special injection handling for <script>/<style> blocks
        if language_name == "svelte" {
            return self.highlight_svelte(content);
        }

        // ── Native-first (no I/O, compiled into the binary) ─────────────────────
        if let Some(lang) = get_native_language(language_name) {
            if let Some(query_src) = get_native_highlights(language_name) {
                let query = match get_or_compile_query(language_name, &lang, &query_src) {
                    Ok(q) => q,
                    Err(e) => {
                        eprintln!("Native query error for '{}': {} — using fallback", language_name, e);
                        return self.basic_fallback(content);
                    }
                };

                let mut parser = Parser::new();
                parser.set_language(&lang).context("Failed to set native language")?;

                let tree = parser
                    .parse(content, None)
                    .context("Native parser returned no tree")?;

                return Ok(self.run_query(content, &tree, &query));
            }
        }

        // ── WASM fallback (community / user-installed languages) ─────────────────
        let wasm_path = REGISTRY.get_parser_lib_path(language_name);
        let queries_path = REGISTRY.get_queries_path(language_name);

        if !wasm_path.exists() || !queries_path.exists() {
            eprintln!(
                "Highlighter: no native or WASM parser for '{}'. Plain text.",
                language_name
            );
            return self.basic_fallback(content);
        }

        let wasm_bytes = std::fs::read(&wasm_path)
            .with_context(|| format!("Failed to read wasm at {:?}", wasm_path))?;

        let query_src = std::fs::read_to_string(&queries_path)
            .with_context(|| format!("Failed to read queries at {:?}", queries_path))?;

        let mut store = tree_sitter::WasmStore::new(&REGISTRY.wasm_engine)
            .context("Failed to create WasmStore")?;

        let lang = store
            .load_language(language_name, &wasm_bytes)
            .with_context(|| format!("Failed to load wasm language '{}'", language_name))?;

        let mut parser = Parser::new();
        parser.set_wasm_store(store).context("Failed to set wasm store")?;
        parser.set_language(&lang).context("Failed to set language")?;

        let tree = parser
            .parse(content, None)
            .context("WASM parser returned no tree")?;

        let query = match Query::new(&lang, &query_src) {
            Ok(q) => q,
            Err(e) => {
                eprintln!("WASM query error for '{}': {} — using fallback", language_name, e);
                return self.basic_fallback(content);
            }
        };

        Ok(self.run_query(content, &tree, &query))
    }

    // ── Svelte: HTML+directives + injected JS/CSS ────────────────────────────────

    fn highlight_svelte(&self, content: &str) -> Result<SyntaxHighlight> {
        let lang: Language = tree_sitter_svelte_ng::LANGUAGE.into();
        let query_src = get_native_highlights("svelte").unwrap_or_default();
        let query = match get_or_compile_query("svelte", &lang, &query_src) {
            Ok(q) => q,
            Err(e) => {
                eprintln!("Svelte query error: {} — using fallback", e);
                return self.basic_fallback(content);
            }
        };

        let mut parser = Parser::new();
        parser.set_language(&lang).context("set svelte language")?;
        let tree = parser.parse(content, None).context("svelte parse failed")?;

        // Build type_map from the Svelte+HTML query
        let content_len = content.len();
        let mut type_map: Vec<TokenType> = vec![TokenType::Unknown; content_len];
        self.apply_query_to_map(content, &tree, &query, &mut type_map);

        // Inject JS into <script> raw_text, CSS into <style> raw_text
        self.inject_into_map(content, tree.root_node(), &mut type_map);

        Ok(SyntaxHighlight {
            tokens: build_tokens(content, &type_map),
            used_fallback: false,
        })
    }

    /// Walk Svelte tree and apply JS/CSS parsers to embedded raw_text nodes.
    fn inject_into_map(&self, content: &str, node: tree_sitter::Node, type_map: &mut Vec<TokenType>) {
        let parent_kind = node.kind();
        for i in 0..node.child_count() {
            let child = node.child(i).unwrap();
            if child.kind() == "raw_text" {
                let inject_lang = match parent_kind {
                    "script_element" => Some("javascript"),
                    "style_element"  => Some("css"),
                    _ => None,
                };
                if let Some(lang_name) = inject_lang {
                    let start = child.start_byte();
                    let end   = child.end_byte().min(content.len());
                    if start < end {
                        self.highlight_injection(&content[start..end], lang_name, start, type_map);
                    }
                }
            }
            self.inject_into_map(content, child, type_map);
        }
    }

    /// Parse a sub-slice with the given language and write token types into
    /// `type_map` at `offset`.
    fn highlight_injection(
        &self,
        sub: &str,
        lang_name: &str,
        offset: usize,
        type_map: &mut Vec<TokenType>,
    ) {
        let (Some(lang), Some(query_src)) = (get_native_language(lang_name), get_native_highlights(lang_name)) else { return };
        let Ok(query) = get_or_compile_query(lang_name, &lang, &query_src) else { return };

        let mut parser = Parser::new();
        if parser.set_language(&lang).is_err() { return }
        let Some(tree) = parser.parse(sub, None) else { return };

        let sub_len = sub.len();
        let mut cursor = QueryCursor::new();
        let mut matches = cursor.matches(&query, tree.root_node(), sub.as_bytes());
        while let Some(m) = matches.next() {
            for capture in m.captures {
                let capture_name = &query.capture_names()[capture.index as usize];
                let token_type = TokenType::from(capture_name.as_ref() as &str);
                let start = capture.node.start_byte();
                let end   = capture.node.end_byte().min(sub_len);
                let abs_start = offset + start;
                let abs_end   = offset + end;
                if abs_end <= type_map.len() {
                    for byte in type_map[abs_start..abs_end].iter_mut() {
                        *byte = token_type.clone();
                    }
                }
            }
        }
    }

    // ── Shared helpers ───────────────────────────────────────────────────────────

    fn apply_query_to_map(
        &self,
        content: &str,
        tree: &tree_sitter::Tree,
        query: &Query,
        type_map: &mut Vec<TokenType>,
    ) {
        let content_len = content.len();
        let mut cursor = QueryCursor::new();
        let mut matches = cursor.matches(query, tree.root_node(), content.as_bytes());
        while let Some(m) = matches.next() {
            for capture in m.captures {
                let capture_name = &query.capture_names()[capture.index as usize];
                let token_type = TokenType::from(capture_name.as_ref() as &str);
                let start = capture.node.start_byte();
                let end   = capture.node.end_byte().min(content_len);
                for byte in type_map[start..end].iter_mut() {
                    *byte = token_type.clone();
                }
            }
        }
    }

    // ── Shared query runner ──────────────────────────────────────────────────────

    fn run_query(
        &self,
        content: &str,
        tree: &tree_sitter::Tree,
        query: &Query,
    ) -> SyntaxHighlight {
        let content_len = content.len();
        let mut type_map: Vec<TokenType> = vec![TokenType::Unknown; content_len];
        self.apply_query_to_map(content, tree, query, &mut type_map);
        SyntaxHighlight {
            tokens: build_tokens(content, &type_map),
            used_fallback: false,
        }
    }

    fn basic_fallback(&self, content: &str) -> Result<SyntaxHighlight> {
        let mut tokens = Vec::new();
        for word in content
            .split_inclusive(|c: char| c.is_whitespace() || !c.is_alphanumeric())
        {
            let token_type = if word.trim().parse::<f64>().is_ok() {
                TokenType::Number
            } else if word.starts_with('"') || word.starts_with('\'') {
                TokenType::String
            } else {
                TokenType::Unknown
            };
            tokens.push(Token {
                text: word.to_string(),
                token_type,
            });
        }
        Ok(SyntaxHighlight {
            tokens,
            used_fallback: true,
        })
    }
}

// Agrupa bytes consecutivos del mismo TokenType en un solo Token
fn build_tokens(content: &str, type_map: &[TokenType]) -> Vec<Token> {
    let mut tokens: Vec<Token> = Vec::new();
    let bytes = content.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        let current_type = type_map[i].clone();
        let start = i;

        // Avanzar mientras el tipo sea el mismo, respetando límites de char UTF-8
        while i < bytes.len() && type_map[i] == current_type {
            i += 1;
        }

        // Aseguramos que el slice sea válido UTF-8
        if let Ok(text) = std::str::from_utf8(&bytes[start..i]) {
            if !text.is_empty() {
                tokens.push(Token {
                    text: text.to_string(),
                    token_type: current_type,
                });
            }
        }
    }

    tokens
}