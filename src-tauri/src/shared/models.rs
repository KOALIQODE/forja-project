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
        match s {
            "keyword" | "repeat" | "conditional" | "include" | "exception" | "label" => TokenType::Keyword,
            "function" | "function.call" | "function.builtin" | "method" | "method.call" => TokenType::Function,
            "type" | "type.builtin" | "type.definition" | "class" | "interface" | "struct" | "enum" => TokenType::Type,
            "string" | "string.content" | "character" | "string_content" => TokenType::String,
            "comment" => TokenType::Comment,
            "number" | "float" | "integer" | "boolean" => TokenType::Number,
            "punctuation.delimiter" | "punctuation.bracket" | "punctuation.special" | "(" | ")" | "[" | "]" | "{" | "}" | ";" | "," | "." => TokenType::Punctuation,
            "operator" | "binary_operator" | "unary_operator" | "assign_operator" | "=" | "+" | "-" | "*" | "/" | "!" | "&" | "|" => TokenType::Operator,
            "variable" | "variable.parameter" | "variable.builtin" | "identifier" => TokenType::Variable,
            "property" | "field" => TokenType::Property,
            _ => TokenType::Unknown,
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
}
