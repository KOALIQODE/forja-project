use anyhow::{Context, Result};
use tree_sitter::{Node, Parser, Point};

#[derive(Debug, Clone, serde::Serialize)]
pub struct CodeBreadcrumb {
    pub items: Vec<BreadcrumbItem>,
    pub line: usize,
    pub column: usize,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BreadcrumbItem {
    pub name: String,
    pub kind: String,
    pub line: usize,
    pub column: usize,
}

// Ya no guarda parser como campo — se crea fresco por llamada
// porque WasmStore no puede compartirse entre threads
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

// Funciones libres en lugar de métodos — no necesitan &self
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
        // Rust
        "function_item"
            | "impl_item"
            | "module"
            | "struct_item"
            | "enum_item"
            | "trait_item"
            // JS / TS — functions & classes
            | "class_declaration"
            | "class_expression"
            | "method_definition"
            | "function_declaration"
            | "function_expression"
            | "generator_function_declaration"
            | "generator_function"
            | "arrow_function"
            // JS / TS — objects (show key name as breadcrumb)
            | "pair"
            | "method_signature"
            | "property_signature"
            // TS-specific
            | "interface_declaration"
            | "type_alias_declaration"
            | "abstract_class_declaration"
            | "enum_declaration"
            // HTML / Svelte
            | "element"
            | "script_element"
    )
}

/// Returns true only for pair nodes whose value is a nested object or function
/// (avoids noise from simple scalar properties like `port: 1420`)
fn is_complex_pair(node: &Node) -> bool {
    if node.kind() != "pair" && node.kind() != "property_signature" && node.kind() != "method_signature" {
        return true; // non-pair nodes are always significant
    }
    // For pairs: only include if value is object, array, or function-like
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
                // const foo = () => {}  |  let foo = function() {}
                "variable_declarator" | "assignment_expression" => {
                    let mut cursor = p.walk();
                    for child in p.children(&mut cursor) {
                        if matches!(child.kind(), "identifier" | "property_identifier") {
                            return child.utf8_text(source.as_bytes()).unwrap_or("anonymous").to_string();
                        }
                    }
                }
                // class Foo { bar = () => {} }
                "field_definition" | "public_field_definition" => {
                    let mut cursor = p.walk();
                    for child in p.children(&mut cursor) {
                        if matches!(child.kind(), "property_identifier" | "identifier") {
                            return child.utf8_text(source.as_bytes()).unwrap_or("anonymous").to_string();
                        }
                    }
                }
                // defineConfig(() => {})  — climb to call_expression via grandparent
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

    // Named functions / classes / Rust items — look for a direct name child
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
        // JSON pairs: keys are `string` nodes — strip surrounding quotes
        if child.kind() == "string" {
            let raw = child.utf8_text(source.as_bytes()).unwrap_or("\"anonymous\"");
            return raw.trim_matches('"').to_string();
        }
    }
    "anonymous".to_string()
}