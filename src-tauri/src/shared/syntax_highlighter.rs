use anyhow::{Context, Result};
use dashmap::DashMap;
use lazy_static::lazy_static;
use parking_lot::Mutex;
use std::sync::Arc;
use tree_sitter::{Language, Parser, Query, QueryCursor};
use streaming_iterator::StreamingIterator;

use crate::parser::cache::CacheManager;
use crate::parser::loader::ParserLoader;
use crate::shared::models::{SyntaxHighlight, Token, TokenType};

// ── Global caches ──────────────────────────────────────────────────────────────
lazy_static! {
    static ref QUERY_CACHE: DashMap<String, Arc<Query>> = DashMap::new();
    pub static ref PARSER_LOADER: Mutex<ParserLoader> = Mutex::new(ParserLoader::new());
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

    /// Highlight `content` using the compiled native parser for `language_name`.
    ///
    /// Parsers are loaded from `~/.local/share/forja/parsers/{lang}/parser.so` (or .dylib/.dll).
    /// If the parser has not been installed yet, returns plain-text tokens so the editor
    /// can still display the file while the user installs the parser via Grammar Hub.
    pub fn highlight(&self, content: &str, language_name: &str) -> Result<SyntaxHighlight> {
        match self.highlight_dynamic(content, language_name) {
            Ok(result) => Ok(result),
            Err(e) => {
                // Parser not installed or query compilation failed — plain text
                eprintln!(
                    "Highlighter: '{}' not available ({}). Open Grammar Hub to install.",
                    language_name, e
                );
                self.basic_fallback(content)
            }
        }
    }

    // ── Dynamic binary path ───────────────────────────────────────────────────────

    fn highlight_dynamic(&self, content: &str, language_name: &str) -> Result<SyntaxHighlight> {
        let cache = CacheManager::new()
            .map_err(|e| anyhow::anyhow!("CacheManager init failed: {}", e))?;

        let binary_path  = cache.binary_path(language_name);
        let queries_path = cache.queries_path(language_name);

        if !binary_path.exists() {
            anyhow::bail!("binary not installed for '{}'", language_name);
        }
        if !queries_path.exists() {
            anyhow::bail!("queries not installed for '{}'", language_name);
        }

        let language = {
            let mut loader = PARSER_LOADER.lock();
            loader
                .get_language(language_name, &binary_path)
                .map_err(|e| anyhow::anyhow!("load library '{}': {}", language_name, e))?
        };

        let query_src = std::fs::read_to_string(&queries_path)
            .with_context(|| format!("read queries for '{}'", language_name))?;

        if query_src.trim().is_empty() {
            anyhow::bail!("empty query file for '{}'", language_name);
        }

        let query = get_or_compile_query(language_name, &language, &query_src)
            .map_err(|e| {
                let chain: Vec<String> = e.chain().map(|c| c.to_string()).collect();
                anyhow::anyhow!("query error for '{}': {}", language_name, chain.join(" → "))
            })?;

        let mut parser = Parser::new();
        parser.set_language(&language).context("set parser language")?;
        let tree = parser.parse(content, None).context("parser returned no tree")?;

        let content_len = content.len();
        let mut type_map = vec![TokenType::Unknown; content_len];
        self.fill_type_map(content, &tree, &query, &mut type_map);

        // Apply language injections (e.g. JS inside <script>, CSS inside <style>)
        for (inj_lang, start, end) in Self::find_injection_ranges(&tree, language_name) {
            self.inject_highlight(content, start, end, &inj_lang, &mut type_map);
        }

        Ok(SyntaxHighlight {
            tokens: build_tokens(content, &type_map),
            used_fallback: false,
        })
    }

    // ── Shared helpers ────────────────────────────────────────────────────────────

    /// Fill `type_map` (byte-indexed) with token types from a tree-sitter query.
    fn fill_type_map(&self, content: &str, tree: &tree_sitter::Tree, query: &Query, type_map: &mut Vec<TokenType>) {
        let content_len = type_map.len();
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

    /// Walk the AST to find embedded-language ranges.
    /// Returns (language_name, start_byte, end_byte) tuples.
    /// Handles:
    ///   - Svelte: <script> (JS) and <style> (CSS) blocks
    ///   - Markdown: `inline` nodes parsed by tree-sitter-markdown-inline
    fn find_injection_ranges(tree: &tree_sitter::Tree, language_name: &str) -> Vec<(String, usize, usize)> {
        match language_name {
            "svelte" => {
                fn walk_svelte(node: tree_sitter::Node, out: &mut Vec<(String, usize, usize)>) {
                    let lang = match node.kind() {
                        "script_element" => Some("javascript"),
                        "style_element"  => Some("css"),
                        _ => None,
                    };
                    if let Some(inj_lang) = lang {
                        for i in 0..node.child_count() {
                            if let Some(child) = node.child(i) {
                                if child.kind() == "raw_text" {
                                    out.push((inj_lang.to_string(), child.start_byte(), child.end_byte()));
                                }
                            }
                        }
                    }
                    for i in 0..node.child_count() {
                        if let Some(child) = node.child(i) {
                            walk_svelte(child, out);
                        }
                    }
                }
                let mut result = Vec::new();
                walk_svelte(tree.root_node(), &mut result);
                result
            }

            "markdown" => {
                // The block parser leaves all inline content as `inline` nodes.
                // Inject tree-sitter-markdown-inline for each of them.
                fn walk_md(node: tree_sitter::Node, out: &mut Vec<(String, usize, usize)>) {
                    if node.kind() == "inline" {
                        out.push(("markdown_inline".to_string(), node.start_byte(), node.end_byte()));
                        return; // no need to recurse inside
                    }
                    for i in 0..node.child_count() {
                        if let Some(child) = node.child(i) {
                            walk_md(child, out);
                        }
                    }
                }
                let mut result = Vec::new();
                walk_md(tree.root_node(), &mut result);
                result
            }

            _ => vec![],
        }
    }

    /// Highlight `content[start..end]` with `lang`'s parser and write non-Unknown
    /// token types into the corresponding positions of `type_map`.
    fn inject_highlight(&self, content: &str, start: usize, end: usize, lang: &str, type_map: &mut Vec<TokenType>) {
        let Ok(cache) = CacheManager::new() else { return };
        let binary_path  = cache.binary_path(lang);
        let queries_path = cache.queries_path(lang);
        if !binary_path.exists() || !queries_path.exists() { return; }

        let language = {
            let mut loader = PARSER_LOADER.lock();
            match loader.get_language(lang, &binary_path) {
                Ok(l) => l,
                Err(e) => { eprintln!("⚠️  inject load '{}': {}", lang, e); return; }
            }
        };

        let Ok(query_src) = std::fs::read_to_string(&queries_path) else { return };
        if query_src.trim().is_empty() { return; }

        let cache_key = format!("{}::sub", lang);
        let Ok(query) = get_or_compile_query(&cache_key, &language, &query_src) else { return };

        // Slice out the embedded text — use byte boundaries safely
        let end_clamped = end.min(content.len());
        let Some(sub_content) = content.as_bytes().get(start..end_clamped) else { return };
        let Ok(sub_str) = std::str::from_utf8(sub_content) else { return };

        let mut parser = Parser::new();
        let Ok(()) = parser.set_language(&language) else { return };
        let Some(sub_tree) = parser.parse(sub_str, None) else { return };

        let sub_len = sub_str.len();
        let mut sub_map = vec![TokenType::Unknown; sub_len];
        self.fill_type_map(sub_str, &sub_tree, &query, &mut sub_map);

        for (i, t) in sub_map.into_iter().enumerate() {
            if t != TokenType::Unknown {
                let pos = start + i;
                if pos < type_map.len() {
                    type_map[pos] = t;
                }
            }
        }
    }

    fn basic_fallback(&self, content: &str) -> Result<SyntaxHighlight> {
        let mut tokens = Vec::new();
        for word in content.split_inclusive(|c: char| c.is_whitespace() || !c.is_alphanumeric()) {
            let token_type = if word.trim().parse::<f64>().is_ok() {
                TokenType::Number
            } else if word.starts_with('"') || word.starts_with('\'') {
                TokenType::String
            } else {
                TokenType::Unknown
            };
            tokens.push(Token { text: word.to_string(), token_type });
        }
        Ok(SyntaxHighlight { tokens, used_fallback: true })
    }
}

fn build_tokens(content: &str, type_map: &[TokenType]) -> Vec<Token> {
    let mut tokens: Vec<Token> = Vec::new();
    let bytes = content.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let current_type = type_map[i].clone();
        let start = i;
        while i < bytes.len() && type_map[i] == current_type {
            i += 1;
        }
        if let Ok(text) = std::str::from_utf8(&bytes[start..i]) {
            if !text.is_empty() {
                tokens.push(Token { text: text.to_string(), token_type: current_type });
            }
        }
    }
    tokens
}
