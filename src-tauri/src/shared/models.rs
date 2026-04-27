use serde::{Deserialize, Serialize};

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
    // Add more as needed
    Unknown,
}

impl From<&str> for TokenType {
    fn from(s: &str) -> Self {
        let base_scope = s.split('.').next().unwrap_or(s);
        match base_scope {
            "keyword" | "repeat" | "conditional" | "include" | "exception" | "label"
            | "storage" | "define" => TokenType::Keyword,
            "function" | "method" | "call" => TokenType::Function,
            "type" | "class" | "interface" | "struct" | "enum" => TokenType::Type,
            "string" | "character" => TokenType::String,
            "comment" => TokenType::Comment,
            "number" | "float" | "integer" | "boolean" => TokenType::Number,
            "punctuation" => TokenType::Punctuation,
            "operator" => TokenType::Operator,
            "variable" | "parameter" | "identifier" => TokenType::Variable,
            "property" | "field" | "attribute" => TokenType::Property,
            // Fallback para símbolos directos que a veces TS envía como scope
            "(" | ")" | "[" | "]" | "{" | "}" | ";" | "," | "." => TokenType::Punctuation,
            "=" | "+" | "-" | "*" | "/" | "!" | "&" | "|" => TokenType::Operator,
            _ => {
                // Si contiene alguna de estas palabras en cualquier parte del scope
                if s.contains("function") || s.contains("method") {
                    TokenType::Function
                } else if s.contains("type") || s.contains("class") {
                    TokenType::Type
                } else if s.contains("variable") {
                    TokenType::Variable
                } else if s.contains("property") || s.contains("field") {
                    TokenType::Property
                } else {
                    TokenType::Unknown
                }
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub text: String,
    pub token_type: TokenType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyntaxHighlight {
    pub tokens: Vec<Token>,
    pub used_fallback: bool,
}
