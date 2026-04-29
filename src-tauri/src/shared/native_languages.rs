/// Native language registry — all core parsers compiled into the binary.
///
/// Uses each crate's own bundled `HIGHLIGHTS_QUERY` constant — always correct
/// node names, always up-to-date with the grammar.

use tree_sitter::Language;

// ── Public API ─────────────────────────────────────────────────────────────────

/// Returns the native `Language` for a core language, or `None` for community WASM langs.
pub fn get_native_language(name: &str) -> Option<Language> {
    match name {
        "rust"       => Some(tree_sitter_rust::LANGUAGE.into()),
        "javascript" => Some(tree_sitter_javascript::LANGUAGE.into()),
        "jsx"        => Some(tree_sitter_javascript::LANGUAGE.into()),
        "typescript" => Some(tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()),
        "tsx"        => Some(tree_sitter_typescript::LANGUAGE_TSX.into()),
        "python"     => Some(tree_sitter_python::LANGUAGE.into()),
        "json"       => Some(tree_sitter_json::LANGUAGE.into()),
        "html"       => Some(tree_sitter_html::LANGUAGE.into()),
        "css"        => Some(tree_sitter_css::LANGUAGE.into()),
        "go"         => Some(tree_sitter_go::LANGUAGE.into()),
        "markdown"   => Some(tree_sitter_md::LANGUAGE.into()),
        "svelte"     => Some(tree_sitter_svelte_ng::LANGUAGE.into()),
        _            => None,
    }
}

/// Returns the compiled highlight query source for a native language.
///
/// TypeScript/TSX extend JavaScript — the TS crate only ships TS-specific
/// rules (35 lines: types, generics, etc.).  We must prepend the full JS
/// query so that keywords, strings, functions, etc. are highlighted too.
/// The combined string is returned as an owned `String`; callers should
/// compile it once and cache the resulting `Query`.
pub fn get_native_highlights(name: &str) -> Option<String> {
    match name {
        "rust"       => Some(tree_sitter_rust::HIGHLIGHTS_QUERY.to_owned()),
        "javascript" => Some(tree_sitter_javascript::HIGHLIGHT_QUERY.to_owned()),
        "jsx"        => {
            // JSX adds extra highlight patterns on top of JS
            let mut q = tree_sitter_javascript::HIGHLIGHT_QUERY.to_owned();
            q.push('\n');
            q.push_str(tree_sitter_javascript::JSX_HIGHLIGHT_QUERY);
            Some(q)
        }
        "typescript" => {
            // TS grammar inherits all JS nodes; combine both queries
            let mut q = tree_sitter_javascript::HIGHLIGHT_QUERY.to_owned();
            q.push('\n');
            q.push_str(tree_sitter_typescript::HIGHLIGHTS_QUERY);
            Some(q)
        }
        "tsx" => {
            let mut q = tree_sitter_javascript::HIGHLIGHT_QUERY.to_owned();
            q.push('\n');
            q.push_str(tree_sitter_javascript::JSX_HIGHLIGHT_QUERY);
            q.push('\n');
            q.push_str(tree_sitter_typescript::HIGHLIGHTS_QUERY);
            Some(q)
        }
        "python"   => Some(tree_sitter_python::HIGHLIGHTS_QUERY.to_owned()),
        "json"     => Some(tree_sitter_json::HIGHLIGHTS_QUERY.to_owned()),
        "html"     => Some(tree_sitter_html::HIGHLIGHTS_QUERY.to_owned()),
        "css"      => Some(tree_sitter_css::HIGHLIGHTS_QUERY.to_owned()),
        "go"       => Some(tree_sitter_go::HIGHLIGHTS_QUERY.to_owned()),
        "markdown" => Some(tree_sitter_md::HIGHLIGHT_QUERY_BLOCK.to_owned()),
        "svelte"   => {
            // Svelte grammar has 54 nodes — it treats <script>/<style> as raw_text.
            // JS/CSS node types do NOT exist in the Svelte tree, so only combine
            // HTML (structure) + Svelte-specific directives (if/each/await/etc).
            let mut q = tree_sitter_html::HIGHLIGHTS_QUERY.to_owned();
            q.push('\n');
            q.push_str(tree_sitter_svelte_ng::HIGHLIGHTS_QUERY);
            Some(q)
        }
        _          => None,
    }
}

/// Returns true if the language is bundled natively (no WASM download needed).
pub fn is_native(name: &str) -> bool {
    matches!(
        name,
        "rust" | "javascript" | "jsx" | "typescript" | "tsx"
            | "python" | "json" | "html" | "css" | "go" | "markdown" | "svelte"
    )
}

/// Full list of bundled languages (for `list_parsers`).
pub const NATIVE_LANGUAGES: &[(&str, &str)] = &[
    ("rust",       "Rust"),
    ("javascript", "JavaScript"),
    ("typescript", "TypeScript"),
    ("python",     "Python"),
    ("json",       "JSON"),
    ("html",       "HTML"),
    ("css",        "CSS"),
    ("go",         "Go"),
    ("markdown",   "Markdown"),
    ("svelte",     "Svelte"),
];
