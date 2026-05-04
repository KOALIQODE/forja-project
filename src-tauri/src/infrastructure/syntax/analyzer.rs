//! Code structure analyzer — AST-based breadcrumb extraction.
//!
//! [`CodeAnalyzer`] loads a native parser binary (via [`crate::parser`]) and walks
//! the resulting AST to find the lexical context at a given cursor position.
//! Used by the `get_code_breadcrumb` command to show breadcrumbs in the editor status bar.

use anyhow::{Context, Result};
use tree_sitter::{Node, Parser, Point};

/// A breadcrumb trail showing the lexical nesting at a cursor position.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CodeBreadcrumb {
    pub items: Vec<BreadcrumbItem>,
    pub line: usize,
    pub column: usize,
}

/// A single item in a breadcrumb trail (function, class, module, etc.).
#[derive(Debug, Clone, serde::Serialize)]
pub struct BreadcrumbItem {
    pub name: String,
    pub kind: String,
    pub line: usize,
    pub column: usize,
}

/// Stateless analyzer — creates a fresh parser per call since WasmStore is not Send.
pub struct CodeAnalyzer;

impl CodeAnalyzer {
    pub fn new() -> Result<Self> {
        Ok(Self)
    }

    pub fn get_breadcrumb(
        &self,
        content: &str,
        language_name: &str,
        line: usize,
        column: usize,
    ) -> Result<CodeBreadcrumb> {
        let cache = crate::parser::cache::CacheManager::new()
            .map_err(|e| anyhow::anyhow!("CacheManager: {}", e))?;
        let binary_path = cache.binary_path(language_name);

        if !binary_path.exists() {
            anyhow::bail!(
                "Parser '{}' not installed — install via Grammar Hub.",
                language_name
            );
        }

        let mut loader = crate::parser::loader::ParserLoader::new();
        let lang = loader
            .get_language(language_name, &binary_path)
            .map_err(|e| anyhow::anyhow!("load '{}': {}", language_name, e))?;

        let mut parser = Parser::new();
        parser.set_language(&lang).context("set language")?;

        let tree = parser.parse(content, None).context("parser returned no tree")?;

        let target_pos = Point { row: line, column };
        let mut items = Vec::new();
        collect_breadcrumbs(tree.root_node(), None, None, content, target_pos, &mut items);

        Ok(CodeBreadcrumb { items, line, column })
    }
}

fn collect_breadcrumbs<'a>(
    node: Node<'a>,
    parent: Option<Node<'a>>,
    grandparent: Option<Node<'a>>,
    source: &str,
    target_pos: Point,
    items: &mut Vec<BreadcrumbItem>,
) {
    if node.start_position() <= target_pos && target_pos <= node.end_position() {
        if is_significant_node(&node) && is_complex_pair(&node) {
            let name = extract_name(&node, parent, grandparent, source);
            items.push(BreadcrumbItem {
                kind: node.kind().to_string(),
                line: node.start_position().row,
                column: node.start_position().column,
                name,
            });
        }
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            collect_breadcrumbs(child, Some(node), parent, source, target_pos, items);
        }
    }
}

fn is_significant_node(node: &Node) -> bool {
    matches!(
        node.kind(),
        "function_item"
            | "impl_item"
            | "module"
            | "struct_item"
            | "enum_item"
            | "trait_item"
            | "class_declaration"
            | "class_expression"
            | "method_definition"
            | "function_declaration"
            | "function_expression"
            | "generator_function_declaration"
            | "generator_function"
            | "arrow_function"
            | "pair"
            | "method_signature"
            | "property_signature"
            | "interface_declaration"
            | "type_alias_declaration"
            | "abstract_class_declaration"
            | "enum_declaration"
            | "element"
            | "script_element"
    )
}

/// Returns true only for pair nodes whose value is a nested object or function.
fn is_complex_pair(node: &Node) -> bool {
    if node.kind() != "pair" && node.kind() != "property_signature" && node.kind() != "method_signature" {
        return true;
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if matches!(
            child.kind(),
            "object"
                | "array"
                | "arrow_function"
                | "function_expression"
                | "function"
                | "object_type"
                | "tuple_type"
        ) {
            return true;
        }
    }
    false
}

fn extract_name<'a>(node: &Node<'a>, parent: Option<Node<'a>>, grandparent: Option<Node<'a>>, source: &str) -> String {
    if node.kind() == "arrow_function" || node.kind() == "function_expression" || node.kind() == "generator_function" {
        if let Some(p) = parent {
            match p.kind() {
                "variable_declarator" | "assignment_expression" => {
                    let mut cursor = p.walk();
                    for child in p.children(&mut cursor) {
                        if matches!(child.kind(), "identifier" | "property_identifier") {
                            return child.utf8_text(source.as_bytes()).unwrap_or("anonymous").to_string();
                        }
                    }
                }
                "field_definition" | "public_field_definition" => {
                    let mut cursor = p.walk();
                    for child in p.children(&mut cursor) {
                        if matches!(child.kind(), "property_identifier" | "identifier") {
                            return child.utf8_text(source.as_bytes()).unwrap_or("anonymous").to_string();
                        }
                    }
                }
                "arguments" => {
                    if let Some(gp) = grandparent {
                        if gp.kind() == "call_expression" {
                            let mut cursor = gp.walk();
                            for child in gp.children(&mut cursor) {
                                if matches!(child.kind(), "identifier" | "member_expression") {
                                    return child.utf8_text(source.as_bytes()).unwrap_or("anonymous").to_string();
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if matches!(
            child.kind(),
            "identifier"
                | "name"
                | "type_identifier"
                | "tag_name"
                | "property_identifier"
                | "field_identifier"
        ) {
            return child.utf8_text(source.as_bytes()).unwrap_or("anonymous").to_string();
        }
        if child.kind() == "string" {
            let raw = child.utf8_text(source.as_bytes()).unwrap_or("\"anonymous\"");
            return raw.trim_matches('"').to_string();
        }
    }
    "anonymous".to_string()
}
