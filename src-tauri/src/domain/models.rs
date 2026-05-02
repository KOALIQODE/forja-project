//! Domain models — shared value types used across layers.
//!
//! These types are serialisable (Serde) and free of infrastructure dependencies.
//! They travel between the domain, infrastructure, and commands layers.

use serde::{Deserialize, Serialize};

/// Semantic token type derived from tree-sitter capture names.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TokenType {
    Keyword,
    Function,
    Type,
    String,
    Comment,
    Number,
    Punctuation,
    Operator,
    Variable,
    Property,
    Constant,
    Attribute,
    Boolean,
    Unknown,
}

impl From<&str> for TokenType {
    fn from(s: &str) -> Self {
        let base = s.split('.').next().unwrap_or(s);
        match base {
            "keyword" | "repeat" | "conditional" | "include"
            | "exception" | "label" | "storage" | "define" => TokenType::Keyword,

            "function" | "method" | "call" | "constructor" => TokenType::Function,

            "type" | "class" | "interface" | "struct" | "enum" => TokenType::Type,

            // HTML/JSX tag names
            "tag" => TokenType::Type,

            "string" | "character" => TokenType::String,

            "comment" => TokenType::Comment,

            "boolean" => TokenType::Boolean,

            "number" | "float" | "integer" => TokenType::Number,

            "punctuation" => TokenType::Punctuation,

            "operator" => TokenType::Operator,

            "variable" | "parameter" | "identifier" => TokenType::Variable,

            "property" | "field" => TokenType::Property,

            "attribute" => TokenType::Attribute,

            "constant" => TokenType::Constant,

            // Markdown / markup (@text.title, @text.literal, @markup.heading, etc.)
            "markup" => TokenType::Keyword,
            "text" => {
                if s.contains("literal") || s.contains("uri") || s.contains("reference") {
                    TokenType::String
                } else if s.contains("title") || s.contains("heading") {
                    TokenType::Keyword
                } else if s.contains("emphasis") {
                    TokenType::Variable
                } else if s.contains("strong") {
                    TokenType::Constant
                } else {
                    TokenType::Unknown
                }
            }

            // Symbols directos que tree-sitter a veces manda como scope
            "(" | ")" | "[" | "]" | "{" | "}" | ";" | "," | "." => TokenType::Punctuation,
            "=" | "+" | "-" | "*" | "/" | "!" | "&" | "|"       => TokenType::Operator,

            _ => {
                if s.contains("function") || s.contains("method") {
                    TokenType::Function
                } else if s.contains("type") || s.contains("class") {
                    TokenType::Type
                } else if s.contains("constant") {
                    TokenType::Constant
                } else if s.contains("variable") {
                    TokenType::Variable
                } else if s.contains("property") || s.contains("field") {
                    TokenType::Property
                } else if s.contains("attribute") {
                    TokenType::Attribute
                } else {
                    TokenType::Unknown
                }
            }
        }
    }
}

/// A single token with its text content and semantic type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub text: String,
    pub token_type: TokenType,
}

/// Full syntax highlight result for a source file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyntaxHighlight {
    pub tokens: Vec<Token>,
    pub used_fallback: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_type_from_keyword() {
        assert_eq!(TokenType::from("keyword"), TokenType::Keyword);
        assert_eq!(TokenType::from("keyword.control"), TokenType::Keyword);
    }

    #[test]
    fn token_type_from_function() {
        assert_eq!(TokenType::from("function"), TokenType::Function);
        assert_eq!(TokenType::from("function.method"), TokenType::Function);
    }

    #[test]
    fn token_type_from_unknown() {
        assert_eq!(TokenType::from("xyz_unknown"), TokenType::Unknown);
    }

    #[test]
    fn token_type_from_text_title() {
        assert_eq!(TokenType::from("text.title"), TokenType::Keyword);
    }

    #[test]
    fn token_type_from_text_literal() {
        assert_eq!(TokenType::from("text.literal"), TokenType::String);
    }
}
