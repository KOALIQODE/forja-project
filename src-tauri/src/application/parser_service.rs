//! Parser use cases — orchestrate parser installation and management.
//!
//! ## Use Cases
//! - List all available parsers with their installation status
//! - Get status of a specific parser
//! - Download/install a parser binary (with progress callbacks)
//! - Repair broken highlight queries
//!
//! ## Design Pattern: Application Service + Observer (progress callbacks)
//! The `ProgressCallback` type follows the Observer pattern — callers
//! subscribe to download progress events without coupling to Tauri events.
//!
//! ## Note — `#[allow(dead_code)]`
//! These functions are not yet called from `commands/parser_manager.rs`, which
//! currently delegates directly to `infrastructure::parser::manager::ParserManager`.
//! The `#[allow(dead_code)]` annotations keep the compiler quiet until the
//! commands layer is updated to route through this application service.
//! TODO: wire `commands/parser_manager.rs` to call these functions instead of
//!       reaching into infrastructure directly.

use crate::domain::parser_info::ParserInfo;
use crate::infrastructure::parser::manager::ParserManager;

/// Type alias for download progress observer callbacks.
/// The callback receives `(bytes_downloaded, total_bytes)` — both are 0 when unknown.
#[allow(dead_code)] // TODO: wire through commands/parser_manager.rs
pub type ProgressCallback = Box<dyn Fn(u64, u64) + Send + 'static>;

/// Returns all parsers known to the registry with their current installation status.
#[allow(dead_code)] // TODO: wire through commands/parser_manager.rs
pub fn list_all_parsers() -> Result<Vec<ParserInfo>, String> {
    let manager = ParserManager::new().map_err(|e| e.to_string())?;
    Ok(manager.get_all_parsers())
}

/// Returns the current status of a single parser by name.
/// Returns `Err` if the parser name is not in the registry.
#[allow(dead_code)] // TODO: wire through commands/parser_manager.rs
pub fn get_parser_status(parser_name: &str) -> Result<ParserInfo, String> {
    let manager = ParserManager::new().map_err(|e| e.to_string())?;
    manager.get_parser_info(parser_name)
        .ok_or_else(|| format!("Parser '{}' not found", parser_name))
}

/// Downloads and installs a parser binary, reporting progress via callback.
/// Returns the path to the installed binary on success.
#[allow(dead_code)] // TODO: wire through commands/parser_manager.rs
pub async fn install_parser(
    parser_name: &str,
    on_progress: ProgressCallback,
) -> Result<std::path::PathBuf, String> {
    let manager = ParserManager::new().map_err(|e| e.to_string())?;
    manager.ensure_parser_available(parser_name, on_progress)
        .await
        .map_err(|e| e.to_string())
}

/// Re-downloads the highlight query file for a parser.
/// Use this when the installed query file is incompatible with the grammar version.
#[allow(dead_code)] // TODO: wire through commands/parser_manager.rs
pub async fn repair_parser_queries(parser_name: &str) -> Result<(), String> {
    let manager = ParserManager::new().map_err(|e| e.to_string())?;
    manager.repair_queries(parser_name)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_all_parsers_returns_non_empty_list() {
        let result = list_all_parsers();
        assert!(result.is_ok(), "list_all_parsers should succeed: {:?}", result);
        let parsers = result.unwrap();
        assert!(!parsers.is_empty(), "parser registry must define at least one parser");
    }

    #[test]
    fn list_all_parsers_includes_rust() {
        let parsers = list_all_parsers().unwrap();
        let has_rust = parsers.iter().any(|p| p.name.to_lowercase().contains("rust"));
        assert!(has_rust, "parser registry must include a Rust parser");
    }

    #[test]
    fn list_all_parsers_includes_typescript() {
        let parsers = list_all_parsers().unwrap();
        let has_ts = parsers.iter().any(|p| {
            p.name.to_lowercase().contains("typescript") || p.name.to_lowercase().contains("ts")
        });
        assert!(has_ts, "parser registry must include a TypeScript parser");
    }

    #[test]
    fn get_parser_status_known_parser_returns_ok() {
        // The manager registry uses short names like "rust", "typescript", etc.
        let result = get_parser_status("rust");
        assert!(result.is_ok(), "get_parser_status for 'rust' should return Ok: {:?}", result.err());
    }

    #[test]
    fn get_parser_status_unknown_parser_returns_err() {
        let result = get_parser_status("definitely-not-a-real-parser-xyz");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }
}
