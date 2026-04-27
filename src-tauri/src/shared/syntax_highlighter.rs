use anyhow::{Context, Result};
use std::cell::RefCell;
use tree_sitter_highlight::{HighlightConfiguration, HighlightEvent, Highlighter};

use crate::shared::dynamic_parser::{DynamicParser, REGISTRY};
use crate::shared::models::{SyntaxHighlight, Token, TokenType};

thread_local! {
    static HIGHLIGHTER: RefCell<Highlighter> = RefCell::new(Highlighter::new());
}

pub struct SyntaxHighlighter;

impl SyntaxHighlighter {
    pub fn new() -> Result<Self> {
        Ok(SyntaxHighlighter)
    }

    pub fn highlight(&mut self, content: &str, language_name: &str) -> Result<SyntaxHighlight> {
        let lang_result = DynamicParser::load(language_name, &REGISTRY);

        let lang = match lang_result {
            Ok(l) => l,
            Err(e) => {
                eprintln!(
                    "Highlighter: Failed to load parser for {}: {}. Falling back to basic.",
                    language_name, e
                );
                return self.basic_fallback(content);
            }
        };

        // 1. Cargar las queries descargadas (estilo Zed)
        let queries_path = REGISTRY.get_queries_path(language_name);
        if !queries_path.exists() {
            eprintln!(
                "Highlighter: Queries not found at {:?}. Basic fallback.",
                queries_path
            );
            return self.basic_fallback(content);
        }

        let highlight_query = std::fs::read_to_string(queries_path)?;

        // 2. Configurar el resaltador
        let mut config = HighlightConfiguration::new(
            lang,
            &highlight_query,
            "", // injections
            "", // locals
        )
        .context("Failed to create highlight config")?;

        // Mapeo de nombres de clases de tree-sitter a nuestros TokenType
        let highlight_names = [
            "keyword",
            "keyword.function",
            "keyword.operator",
            "keyword.return",
            "function",
            "function.builtin",
            "function.method",
            "function.macro",
            "type",
            "type.builtin",
            "type.enum",
            "type.interface",
            "string",
            "string.escape",
            "string.special",
            "comment",
            "comment.documentation",
            "number",
            "float",
            "boolean",
            "punctuation.delimiter",
            "punctuation.bracket",
            "punctuation.special",
            "operator",
            "variable",
            "variable.parameter",
            "variable.builtin",
            "property",
            "field",
            "attribute",
            "constructor",
            "constant",
            "constant.builtin",
        ];
        config.configure(&highlight_names);

        // 3. Ejecutar el resaltado
        let mut tokens = Vec::new();
        HIGHLIGHTER.with(|h_cell| {
            let mut h = h_cell.borrow_mut();
            let highlights = h
                .highlight(&config, content.as_bytes(), None, |_| None)
                .context("Failed to generate highlights")?;
            let mut highlight_stack: Vec<TokenType> = Vec::new();

            for event in highlights {
                match event? {
                    HighlightEvent::Source { start, end } => {
                        let text = &content[start..end];
                        let token_type = highlight_stack
                            .last()
                            .cloned()
                            .unwrap_or(TokenType::Unknown);

                        tokens.push(Token {
                            text: text.to_string(),
                            token_type,
                        });
                    }
                    HighlightEvent::HighlightStart(s) => {
                        let scope_name = highlight_names[s.0];
                        highlight_stack.push(TokenType::from(scope_name));
                    }
                    HighlightEvent::HighlightEnd => {
                        highlight_stack.pop();
                    }
                }
            }
            Ok::<(), anyhow::Error>(())
        })?;

        Ok(SyntaxHighlight {
            tokens,
            used_fallback: false,
        })
    }

    fn basic_fallback(&self, content: &str) -> Result<SyntaxHighlight> {
        // Fallback extremadamente simple: dividir por espacios y detectar números/strings básicos
        let mut tokens = Vec::new();
        for word in content.split_inclusive(|c: char| c.is_whitespace() || !c.is_alphanumeric()) {
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
