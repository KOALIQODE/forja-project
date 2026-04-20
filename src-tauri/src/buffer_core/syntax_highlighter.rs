use tree_sitter::{Language, Parser, Node};
use tree_sitter_rust;
use tree_sitter_javascript;
use tree_sitter_python;
use tree_sitter_json;
use anyhow::{Context, Result};
use std::cell::RefCell;

use crate::buffer_core::models::{SyntaxHighlight, Token, TokenType};

thread_local! {
    static PARSER: RefCell<Parser> = RefCell::new(Parser::new());
}

pub struct SyntaxHighlighter;

impl SyntaxHighlighter {
    pub fn new() -> Result<Self> {
        Ok(SyntaxHighlighter)
    }

    pub fn highlight(&mut self, content: &str, language_name: &str) -> Result<SyntaxHighlight> {
        let lang = self.get_language(language_name)?;
        
        let tokens = PARSER.with(|parser_cell| -> Result<Vec<Token>> {
            let mut parser = parser_cell.borrow_mut();
            parser.set_language(lang)
                .with_context(|| format!("Failed to set language for tree-sitter: {}", language_name))?;

            let tree = parser.parse(content, None)
                .ok_or_else(|| anyhow::anyhow!("Failed to parse content with tree-sitter"))?;
            
            let mut tokens = Vec::new();
            self.traverse_tree(tree.root_node(), content, &mut tokens);
            Ok(tokens)
        })?;

        Ok(SyntaxHighlight { tokens })
    }

    fn get_language(&self, language_name: &str) -> Result<Language> {
        match language_name {
            "rust" => Ok(tree_sitter_rust::language()),
            "javascript" | "js" => Ok(tree_sitter_javascript::language()),
            "python" | "py" => Ok(tree_sitter_python::language()),
            "json" => Ok(tree_sitter_json::language()),
            _ => Err(anyhow::anyhow!("Unsupported language for highlighting: {}", language_name)),
        }
    }

    fn traverse_tree(&self, node: Node, source: &str, tokens: &mut Vec<Token>) {
        let mut cursor = node.walk();
        let mut last_pos = node.start_byte();

        loop {
            let curr_node = cursor.node();
            
            // If there's a gap between the last position and the current node,
            // it's likely whitespace or something the parser didn't categorize.
            if curr_node.start_byte() > last_pos {
                let text = &source[last_pos..curr_node.start_byte()];
                if !text.is_empty() {
                    tokens.push(Token {
                        text: text.to_string(),
                        token_type: TokenType::Unknown,
                    });
                }
            }

            let token_type: TokenType = curr_node.kind().into();

            if curr_node.child_count() == 0 || token_type != TokenType::Unknown {
                // This is a leaf node or a recognized token
                let text = &source[curr_node.byte_range()];
                tokens.push(Token {
                    text: text.to_string(),
                    token_type,
                });
                last_pos = curr_node.end_byte();
            } else {
                // Structural node, descend if it has children
                if cursor.goto_first_child() {
                    continue;
                } else {
                    last_pos = curr_node.end_byte();
                }
            }

            // Move to next sibling or up
            loop {
                if cursor.goto_next_sibling() {
                    break;
                }
                if cursor.goto_parent() {
                    let parent_node = cursor.node();
                    // Ensure we don't skip trailing text in the parent
                    if parent_node.end_byte() > last_pos && parent_node == node {
                         let text = &source[last_pos..parent_node.end_byte()];
                         if !text.is_empty() {
                             tokens.push(Token {
                                 text: text.to_string(),
                                 token_type: TokenType::Unknown,
                             });
                         }
                         last_pos = parent_node.end_byte();
                    }
                    
                    if parent_node == node {
                        return;
                    }
                } else {
                    return;
                }
            }
        }
    }
}
