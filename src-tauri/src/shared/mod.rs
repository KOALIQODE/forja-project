//! Legacy shim — canonical implementations live in `crate::infrastructure` and `crate::domain`.
//! Kept for backward compatibility only. Prefer the canonical paths directly.
#![allow(unused_imports)]
pub use crate::infrastructure::filesystem::file_index;
pub use crate::infrastructure::filesystem::file_searcher;
pub use crate::infrastructure::syntax::analyzer;
pub use crate::infrastructure::syntax::dynamic_parser;
pub use crate::infrastructure::syntax::native_languages;
pub use crate::infrastructure::syntax::syntax_highlighter;
pub mod models {
    #![allow(unused_imports)]
    pub use crate::domain::models::*;
}
