/// A parser that can be installed on demand.
///
/// `has_prebuilt`:        a prebuilt shared-library asset exists on the GitHub release page.
/// `requires_compilation`: compile from source via the system C/C++ toolchain (cc/gcc/clang).
/// `subdir`:              for repos with multiple grammars, the subdirectory with `src/parser.c`.
/// `hidden`:              internal/companion parser — not shown in Grammar Hub UI.
#[derive(Debug, Clone)]
pub struct ParserEntry {
    pub name: &'static str,
    pub github_repo: &'static str,
    pub has_prebuilt: bool,
    pub requires_compilation: bool,
    pub subdir: Option<&'static str>,
    pub hidden: bool,
}

pub const PARSER_REGISTRY: &[ParserEntry] = &[
    // ── Active parsers ────────────────────────────────────────────────────────
    ParserEntry { name: "rust",            github_repo: "tree-sitter/tree-sitter-rust",              has_prebuilt: false, requires_compilation: true, subdir: None,                              hidden: false },
    ParserEntry { name: "css",             github_repo: "tree-sitter/tree-sitter-css",               has_prebuilt: false, requires_compilation: true, subdir: None,                              hidden: false },
    ParserEntry { name: "svelte",          github_repo: "Himujjal/tree-sitter-svelte",               has_prebuilt: false, requires_compilation: true, subdir: None,                              hidden: false },
    ParserEntry { name: "javascript",      github_repo: "tree-sitter/tree-sitter-javascript",        has_prebuilt: false, requires_compilation: true, subdir: None,                              hidden: false },
    ParserEntry { name: "typescript",      github_repo: "tree-sitter/tree-sitter-typescript",        has_prebuilt: false, requires_compilation: true, subdir: None,                              hidden: false },
    ParserEntry { name: "markdown",        github_repo: "tree-sitter-grammars/tree-sitter-markdown", has_prebuilt: false, requires_compilation: true, subdir: Some("tree-sitter-markdown"),        hidden: false },
    // markdown_inline is installed automatically alongside markdown — not shown in Grammar Hub.
    ParserEntry { name: "markdown_inline", github_repo: "tree-sitter-grammars/tree-sitter-markdown", has_prebuilt: false, requires_compilation: true, subdir: Some("tree-sitter-markdown-inline"), hidden: true  },
    ParserEntry { name: "toml",            github_repo: "ikatyang/tree-sitter-toml",                 has_prebuilt: false, requires_compilation: true, subdir: None,                              hidden: false },
    ParserEntry { name: "json",            github_repo: "tree-sitter/tree-sitter-json",              has_prebuilt: false, requires_compilation: true, subdir: None,                              hidden: false },
    ParserEntry { name: "html",            github_repo: "tree-sitter/tree-sitter-html",              has_prebuilt: false, requires_compilation: true, subdir: None,                              hidden: false },

    // ── Commented out (pending testing) ──────────────────────────────────────
    // ParserEntry { name: "python",  github_repo: "tree-sitter/tree-sitter-python",           has_prebuilt: false, requires_compilation: true, subdir: None, hidden: false },
    // ParserEntry { name: "go",      github_repo: "tree-sitter/tree-sitter-go",               has_prebuilt: false, requires_compilation: true, subdir: None, hidden: false },
    // ParserEntry { name: "cpp",     github_repo: "tree-sitter/tree-sitter-cpp",              has_prebuilt: false, requires_compilation: true, subdir: None, hidden: false },
    // ParserEntry { name: "c",       github_repo: "tree-sitter/tree-sitter-c",                has_prebuilt: false, requires_compilation: true, subdir: None, hidden: false },
    // ParserEntry { name: "java",    github_repo: "tree-sitter/tree-sitter-java",             has_prebuilt: false, requires_compilation: true, subdir: None, hidden: false },
    // ParserEntry { name: "bash",    github_repo: "tree-sitter/tree-sitter-bash",             has_prebuilt: false, requires_compilation: true, subdir: None, hidden: false },
    // ParserEntry { name: "ruby",    github_repo: "tree-sitter/tree-sitter-ruby",             has_prebuilt: false, requires_compilation: true, subdir: None, hidden: false },
    // ParserEntry { name: "php",     github_repo: "tree-sitter/tree-sitter-php",              has_prebuilt: false, requires_compilation: true, subdir: None, hidden: false },
    // ParserEntry { name: "vue",     github_repo: "ikatyang/tree-sitter-vue",                 has_prebuilt: false, requires_compilation: true, subdir: None, hidden: false },
    // ParserEntry { name: "yaml",    github_repo: "tree-sitter-grammars/tree-sitter-yaml",    has_prebuilt: false, requires_compilation: true, subdir: None, hidden: false },
    // ParserEntry { name: "lua",     github_repo: "tree-sitter-grammars/tree-sitter-lua",     has_prebuilt: false, requires_compilation: true, subdir: None, hidden: false },
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_is_non_empty() {
        assert!(!PARSER_REGISTRY.is_empty());
    }

    #[test]
    fn typescript_requires_compilation() {
        let entry = PARSER_REGISTRY.iter().find(|e| e.name == "typescript");
        assert!(entry.is_some(), "typescript must be in the registry");
        assert!(entry.unwrap().requires_compilation);
    }

    #[test]
    fn markdown_inline_is_hidden() {
        let entry = PARSER_REGISTRY.iter().find(|e| e.name == "markdown_inline");
        assert!(entry.is_some(), "markdown_inline must be in the registry");
        assert!(entry.unwrap().hidden);
    }

    #[test]
    fn rust_parser_has_correct_github_repo() {
        let entry = PARSER_REGISTRY.iter().find(|e| e.name == "rust");
        assert!(entry.is_some(), "rust must be in the registry");
        assert_eq!(entry.unwrap().github_repo, "tree-sitter/tree-sitter-rust");
    }

    #[test]
    fn parser_entry_fields_accessible() {
        let entry = &PARSER_REGISTRY[0];
        let _ = entry.name;
        let _ = entry.github_repo;
        let _ = entry.has_prebuilt;
        let _ = entry.requires_compilation;
        let _ = entry.subdir;
        let _ = entry.hidden;
    }
}
