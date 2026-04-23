use tree_sitter_highlight::{Highlighter, HighlightConfiguration, HighlightEvent};
use anyhow::{Context, Result};
use std::cell::RefCell;

use crate::shared::models::{SyntaxHighlight, Token, TokenType};
use crate::shared::dynamic_parser::{DynamicParser, REGISTRY};

thread_local! {
    static HIGHLIGHTER: RefCell<Highlighter> = RefCell::new(Highlighter::new());
}

pub struct SyntaxHighlighter;

impl SyntaxHighlighter {
    pub fn new() -> Result<Self> {
        Ok(SyntaxHighlighter)
    }

    pub fn highlight(&mut self, content: &str, language_name: &str) -> Result<SyntaxHighlight> {
        let lang = DynamicParser::load(language_name, &REGISTRY)?;
        
        // 1. Cargar las queries descargadas (estilo Zed)
        let queries_path = REGISTRY.get_queries_path(language_name);
        let highlight_query = if queries_path.exists() {
            std::fs::read_to_string(queries_path)?
        } else {
            // Fallback muy básico si no hay queries
            "".to_string()
        };

        // 2. Configurar el resaltador
        let mut config = HighlightConfiguration::new(
            lang,
            &highlight_query,
            "", // injections
            ""  // locals
        ).context("Failed to create highlight config")?;

        // Mapeo de nombres de clases de tree-sitter a nuestros TokenType
        let highlight_names = [
            "keyword", "function", "type", "string", "comment", 
            "number", "punctuation", "operator", "variable", "property"
        ];
        config.configure(&highlight_names);

        // 3. Ejecutar el resaltado
        let mut tokens = Vec::new();
        HIGHLIGHTER.with(|h_cell| {
            let mut h = h_cell.borrow_mut();
            let highlights = h.highlight(&config, content.as_bytes(), None, |_| None)
                .context("Failed to generate highlights")?;

            for event in highlights {
                match event? {
                    HighlightEvent::Source { start, end } => {
                        let text = &content[start..end];
                        tokens.push(Token {
                            text: text.to_string(),
                            token_type: TokenType::Unknown,
                        });
                    }
                    HighlightEvent::HighlightStart(s) => {
                        // El último token era "Unknown", ahora sabemos su tipo
                        if let Some(token) = tokens.last_mut() {
                            token.token_type = self.map_highlight_index(s.0);
                        }
                    }
                    HighlightEvent::HighlightEnd => {
                        // Fin de la región resaltada
                    }
                }
            }
            Ok::<(), anyhow::Error>(())
        })?;

        Ok(SyntaxHighlight { tokens })
    }

    fn map_highlight_index(&self, index: usize) -> TokenType {
        match index {
            0 => TokenType::Keyword,
            1 => TokenType::Function,
            2 => TokenType::Type,
            3 => TokenType::String,
            4 => TokenType::Comment,
            5 => TokenType::Number,
            6 => TokenType::Punctuation,
            7 => TokenType::Operator,
            8 => TokenType::Variable,
            9 => TokenType::Property,
            _ => TokenType::Unknown,
        }
    }
}
