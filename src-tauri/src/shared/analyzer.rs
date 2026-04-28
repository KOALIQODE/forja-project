use crate::shared::dynamic_parser::{DynamicParser, REGISTRY};
use anyhow::{Context, Result};
use tree_sitter::{Node, Parser, Point, Language, WasmStore};

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

pub struct CodeAnalyzer {
    parser: Parser,
}

impl CodeAnalyzer {
    pub fn new() -> Result<Self> {
        Ok(Self {
            parser: Parser::new(),
        })
    }

    pub fn get_breadcrumb(
        &mut self,
        content: &str,
        language_name: &str,
        line: usize,
        column: usize,
    ) -> Result<CodeBreadcrumb> {
        // Wasm parsers need a WasmStore associated with the parser
        let mut wasm_store = WasmStore::new(&REGISTRY.wasm_engine)?;
        
        let wasm_lang = wasm_store.load_language(language_name, &std::fs::read(REGISTRY.get_parser_lib_path(language_name))?)?;
        self.parser.set_wasm_store(wasm_store)?;
        self.parser.set_language(&wasm_lang)?;

        let tree = self
            .parser
            .parse(content, None)
            .context("Failed to parse content")?;

        let target_pos = Point { row: line, column };

        let mut items = Vec::new();
        self.collect_breadcrumbs(tree.root_node(), content, target_pos, &mut items);

        Ok(CodeBreadcrumb {
            items,
            line,
            column,
        })
    }

    fn collect_breadcrumbs(
        &self,
        node: Node,
        source: &str,
        target_pos: Point,
        items: &mut Vec<BreadcrumbItem>,
    ) {
        if node.start_position() <= target_pos && target_pos <= node.end_position() {
            if self.is_significant_node(&node) {
                let name = self.extract_name(&node, source);
                let kind = node.kind().to_string();
                let start_pos = node.start_position();

                items.push(BreadcrumbItem {
                    name,
                    kind,
                    line: start_pos.row,
                    column: start_pos.column,
                });
            }

            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                self.collect_breadcrumbs(child, source, target_pos, items);
            }
        }
    }

    fn is_significant_node(&self, node: &Node) -> bool {
        matches!(
            node.kind(),
            "function_item"
                | "impl_item"
                | "module"
                | "class_declaration"
                | "method_definition"
                | "function_declaration"
                | "arrow_function"
                | "struct_item"
                | "enum_item"
                | "trait_item"
                | "element" // Para Svelte
                | "script_element" // Para Svelte
        )
    }

    fn extract_name(&self, node: &Node, source: &str) -> String {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.kind() == "identifier"
                || child.kind() == "name"
                || child.kind() == "type_identifier"
                || child.kind() == "tag_name"
            {
                return child
                    .utf8_text(source.as_bytes())
                    .unwrap_or("anonymous")
                    .to_string();
            }
        }

        "anonymous".to_string()
    }

    fn get_language(&self, lang: &str) -> Result<Language> {
        DynamicParser::load(lang, &REGISTRY)
    }
}
