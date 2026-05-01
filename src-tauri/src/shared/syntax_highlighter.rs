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

        let mut loader = PARSER_LOADER.lock();
        let language = loader
            .get_language(language_name, &binary_path)
            .map_err(|e| anyhow::anyhow!("load library '{}': {}", language_name, e))?;

        let query_src = std::fs::read_to_string(&queries_path)
            .with_context(|| format!("read queries for '{}'", language_name))?;

        if query_src.trim().is_empty() {
            anyhow::bail!("empty query file for '{}'", language_name);
        }

        let query = get_or_compile_query(language_name, &language, &query_src)
            .map_err(|e| {
                // Log the full error chain so we can diagnose query issues
                let chain: Vec<String> = e.chain().map(|c| c.to_string()).collect();
                anyhow::anyhow!("query error for '{}': {}", language_name, chain.join(" → "))
            })?;

        let mut parser = Parser::new();
        parser.set_language(&language)
            .context("set parser language")?;

        let tree = parser.parse(content, None)
            .context("parser returned no tree")?;

        Ok(self.run_query(content, &tree, &query))
    }

    // ── Shared helpers ────────────────────────────────────────────────────────────

    fn run_query(&self, content: &str, tree: &tree_sitter::Tree, query: &Query) -> SyntaxHighlight {
        let content_len = content.len();
        let mut type_map: Vec<TokenType> = vec![TokenType::Unknown; content_len];

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

        SyntaxHighlight {
            tokens: build_tokens(content, &type_map),
            used_fallback: false,
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
