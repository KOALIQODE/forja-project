/// A parser that can be installed on demand.
///
/// `has_prebuilt`:        a prebuilt shared-library asset exists on the GitHub release page.
///                        Currently **none** of the upstream tree-sitter repos ship `.so/.dylib/.dll`
///                        release assets, so this is `false` for all entries.  Set to `true` in the
///                        future if we publish our own prebuilt binaries.
/// `requires_compilation`: compile from source via the system C/C++ toolchain (cc/gcc/clang).
#[derive(Debug, Clone)]
pub struct ParserEntry {
    pub name: &'static str,
    pub github_repo: &'static str,
    pub has_prebuilt: bool,
    pub requires_compilation: bool,
}

pub const PARSER_REGISTRY: &[ParserEntry] = &[
    // ── Official tree-sitter grammars ─────────────────────────────────────────
    ParserEntry { name: "rust",       github_repo: "tree-sitter/tree-sitter-rust",       has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "javascript", github_repo: "tree-sitter/tree-sitter-javascript", has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "typescript", github_repo: "tree-sitter/tree-sitter-typescript", has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "python",     github_repo: "tree-sitter/tree-sitter-python",     has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "json",       github_repo: "tree-sitter/tree-sitter-json",       has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "html",       github_repo: "tree-sitter/tree-sitter-html",       has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "css",        github_repo: "tree-sitter/tree-sitter-css",        has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "go",         github_repo: "tree-sitter/tree-sitter-go",         has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "cpp",        github_repo: "tree-sitter/tree-sitter-cpp",        has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "c",          github_repo: "tree-sitter/tree-sitter-c",          has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "java",       github_repo: "tree-sitter/tree-sitter-java",       has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "bash",       github_repo: "tree-sitter/tree-sitter-bash",       has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "ruby",       github_repo: "tree-sitter/tree-sitter-ruby",       has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "php",        github_repo: "tree-sitter/tree-sitter-php",        has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "markdown",   github_repo: "tree-sitter/tree-sitter-markdown",   has_prebuilt: false, requires_compilation: true },
    // ── Community grammars ────────────────────────────────────────────────────
    ParserEntry { name: "svelte",     github_repo: "tree-sitter-grammars/tree-sitter-svelte", has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "vue",        github_repo: "ikatyang/tree-sitter-vue",               has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "toml",       github_repo: "ikatyang/tree-sitter-toml",               has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "yaml",       github_repo: "ikatyang/tree-sitter-yaml",               has_prebuilt: false, requires_compilation: true },
    ParserEntry { name: "lua",        github_repo: "tree-sitter-grammars/tree-sitter-lua",    has_prebuilt: false, requires_compilation: true },
];
