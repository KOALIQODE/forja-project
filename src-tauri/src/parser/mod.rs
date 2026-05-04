//! Legacy shim — canonical implementation lives in `crate::infrastructure::parser`.
//! Kept because other modules still reference `crate::parser::*`.
#[allow(unused_imports)]
pub use crate::infrastructure::parser::cache;
#[allow(unused_imports)]
pub use crate::infrastructure::parser::compiler;
#[allow(unused_imports)]
pub use crate::infrastructure::parser::downloader;
#[allow(unused_imports)]
pub use crate::infrastructure::parser::loader;
#[allow(unused_imports)]
pub use crate::infrastructure::parser::manager;
#[allow(unused_imports)]
pub use crate::infrastructure::parser::registry;
#[allow(unused_imports)]
pub use crate::infrastructure::parser::updater;
#[allow(unused_imports)]
pub use crate::infrastructure::parser::validator;