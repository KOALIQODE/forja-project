use mlua::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ThemeColors {
    pub bg: Option<String>,
    pub fg: Option<String>,
    pub cursor: Option<String>,
    pub selection: Option<String>,
    pub line_number: Option<String>,
    pub gutter_bg: Option<String>,
    pub border: Option<String>,
    pub active_line: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ThemeSyntax {
    pub keyword: Option<String>,
    pub string: Option<String>,
    pub function_name: Option<String>,
    pub variable: Option<String>,
    pub r#type: Option<String>,
    pub constant: Option<String>,
    pub comment: Option<String>,
    pub operator: Option<String>,
    pub number: Option<String>,
    pub punctuation: Option<String>,
    pub attribute: Option<String>,
    pub tag: Option<String>,
    pub namespace: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeDefinition {
    pub name: String,
    pub colors: ThemeColors,
    pub syntax: ThemeSyntax,
    /// Bracket pair colors by depth index (1-based depth → index 0)
    pub brackets: Vec<String>,
}

impl ThemeDefinition {
    pub fn from_lua_table(table: &LuaTable) -> LuaResult<Self> {
        let name: String = table.get("name")?;

        let colors = match table.get::<LuaValue>("colors")? {
            LuaValue::Table(t) => ThemeColors {
                bg: t.get("bg").ok(),
                fg: t.get("fg").ok(),
                cursor: t.get("cursor").ok(),
                selection: t.get("selection").ok(),
                line_number: t.get("line_number").ok(),
                gutter_bg: t.get("gutter_bg").ok(),
                border: t.get("border").ok(),
                active_line: t.get("active_line").ok(),
            },
            _ => ThemeColors::default(),
        };

        let syntax = match table.get::<LuaValue>("syntax")? {
            LuaValue::Table(t) => ThemeSyntax {
                keyword: t.get("keyword").ok(),
                string: t.get("string").ok(),
                function_name: t.get("function_name").ok(),
                variable: t.get("variable").ok(),
                r#type: t.get("type").ok(),
                constant: t.get("constant").ok(),
                comment: t.get("comment").ok(),
                operator: t.get("operator").ok(),
                number: t.get("number").ok(),
                punctuation: t.get("punctuation").ok(),
                attribute: t.get("attribute").ok(),
                tag: t.get("tag").ok(),
                namespace: t.get("namespace").ok(),
            },
            _ => ThemeSyntax::default(),
        };

        let brackets = match table.get::<LuaValue>("brackets")? {
            LuaValue::Table(t) => t
                .sequence_values::<String>()
                .collect::<LuaResult<Vec<_>>>()?,
            _ => vec![],
        };

        Ok(ThemeDefinition {
            name,
            colors,
            syntax,
            brackets,
        })
    }
}
