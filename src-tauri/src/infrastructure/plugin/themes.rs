//! Theme infrastructure — provides [`ThemeDefinition`] deserialisable from Lua tables.

use mlua::prelude::*;
use serde::{Deserialize, Serialize};

/// The base (non-syntax) colours of a theme.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ThemeColors {
    /// Editor background colour.
    pub bg: Option<String>,
    /// Default foreground/text colour.
    pub fg: Option<String>,
    /// Cursor colour.
    pub cursor: Option<String>,
    /// Visual-selection highlight colour.
    pub selection: Option<String>,
    /// Line-number gutter text colour.
    pub line_number: Option<String>,
    /// Line-number gutter background colour.
    pub gutter_bg: Option<String>,
    /// Panel/widget border colour.
    pub border: Option<String>,
    /// Active line highlight colour.
    pub active_line: Option<String>,
}

/// Syntax-token colours for a theme.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ThemeSyntax {
    /// Keyword colour (e.g. `fn`, `let`, `if`).
    pub keyword: Option<String>,
    /// String literal colour.
    pub string: Option<String>,
    /// Function name colour.
    pub function_name: Option<String>,
    /// Variable/identifier colour.
    pub variable: Option<String>,
    /// Type name colour.
    pub r#type: Option<String>,
    /// Constant colour.
    pub constant: Option<String>,
    /// Comment colour.
    pub comment: Option<String>,
    /// Operator colour.
    pub operator: Option<String>,
    /// Numeric literal colour.
    pub number: Option<String>,
    /// Punctuation colour.
    pub punctuation: Option<String>,
    /// Attribute/decorator colour.
    pub attribute: Option<String>,
    /// HTML/JSX tag colour.
    pub tag: Option<String>,
    /// Namespace/module colour.
    pub namespace: Option<String>,
}

/// A complete theme definition with colours, syntax tokens, and bracket colours.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeDefinition {
    /// Unique theme identifier (matches `manifest.lua` `name` field).
    pub name: String,
    /// Base editor colours.
    pub colors: ThemeColors,
    /// Syntax-token colours.
    pub syntax: ThemeSyntax,
    /// Bracket pair colours by nesting depth (depth 1 → index 0).
    pub brackets: Vec<String>,
}

impl ThemeDefinition {
    /// Deserialise a [`ThemeDefinition`] from a Lua table produced by a theme plugin.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theme_definition_serde_round_trip() {
        let theme = ThemeDefinition {
            name: "test-theme".into(),
            colors: ThemeColors {
                bg: Some("#1a1b26".into()),
                fg: Some("#c0caf5".into()),
                ..Default::default()
            },
            syntax: ThemeSyntax {
                keyword: Some("#bb9af7".into()),
                ..Default::default()
            },
            brackets: vec!["#ffd700".into(), "#da70d6".into()],
        };

        let json = serde_json::to_string(&theme).unwrap();
        let restored: ThemeDefinition = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.name, "test-theme");
        assert_eq!(restored.colors.bg.as_deref(), Some("#1a1b26"));
        assert_eq!(restored.syntax.keyword.as_deref(), Some("#bb9af7"));
        assert_eq!(restored.brackets.len(), 2);
    }

    #[test]
    fn theme_colors_default_all_none() {
        let colors = ThemeColors::default();
        assert!(colors.bg.is_none());
        assert!(colors.fg.is_none());
    }

    #[test]
    fn theme_syntax_default_all_none() {
        let syntax = ThemeSyntax::default();
        assert!(syntax.keyword.is_none());
        assert!(syntax.comment.is_none());
    }
}
