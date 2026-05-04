//! Memory-mapped text search — regex-based grep over a single file.
//!
//! [`FileSearcher`] memory-maps the target file so no heap copy is needed for
//! large files. Results carry line/column coordinates for editor navigation.
//!
//! This is an outbound adapter in the Hexagonal Architecture: it handles all
//! filesystem I/O for the full-text search path.

use anyhow::{Context, Result};
use memmap2::Mmap;
use regex::Regex;
use std::fs::File;

/// A single text-search match within a file.
#[derive(serde::Serialize, Clone, Debug)]
pub struct SearchResult {
    pub line_num: u32,
    pub col_num: u32,
    pub line_content: String,
}

/// Stateless searcher — all state lives in the parameters.
pub struct FileSearcher;

impl FileSearcher {
    /// Searches `file_path` for regex `pattern`, returning up to `max_results` matches.
    pub fn search_in_file(
        file_path: &str,
        pattern: &str,
        max_results: usize,
    ) -> Result<Vec<SearchResult>> {
        let file = File::open(file_path)
            .with_context(|| format!("Failed to open file for searching: {}", file_path))?;
        let mmap = unsafe { Mmap::map(&file) }
            .with_context(|| format!("Failed to memory map file for searching: {}", file_path))?;

        let re =
            Regex::new(pattern).with_context(|| format!("Invalid regex pattern: {}", pattern))?;

        let mut results = Vec::new();
        for (line_idx, raw_line) in mmap.split(|&byte| byte == b'\n').enumerate() {
            let line_content = if raw_line.last() == Some(&b'\r') {
                String::from_utf8_lossy(&raw_line[..raw_line.len() - 1]).into_owned()
            } else {
                String::from_utf8_lossy(raw_line).into_owned()
            };

            for mat in re.find_iter(&line_content) {
                if results.len() >= max_results {
                    return Ok(results);
                }
                results.push(SearchResult {
                    line_num: line_idx as u32,
                    col_num: mat.start() as u32,
                    line_content: line_content.clone(),
                });
            }
        }

        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_temp_file(content: &str) -> (tempfile::NamedTempFile, String) {
        let mut f = tempfile::NamedTempFile::new().unwrap();
        f.write_all(content.as_bytes()).unwrap();
        let path = f.path().to_string_lossy().to_string();
        (f, path)
    }

    #[test]
    fn search_finds_match() {
        let (_f, path) = write_temp_file("hello world\nfoo bar\nhello again\n");
        let results = FileSearcher::search_in_file(&path, "hello", 10).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].line_num, 0);
        assert_eq!(results[1].line_num, 2);
    }

    #[test]
    fn search_respects_max_results() {
        let (_f, path) = write_temp_file("a\na\na\na\na\n");
        let results = FileSearcher::search_in_file(&path, "a", 3).unwrap();
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn search_no_match_returns_empty() {
        let (_f, path) = write_temp_file("hello world\n");
        let results = FileSearcher::search_in_file(&path, "xyz", 10).unwrap();
        assert!(results.is_empty());
    }
}
