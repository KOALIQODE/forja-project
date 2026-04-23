use memmap2::Mmap;
use std::fs::File;
use anyhow::{Context, Result};
use regex::Regex;

#[derive(serde::Serialize, Clone, Debug)]
pub struct SearchResult {
    pub line_num: u32,
    pub col_num: u32,
    pub line_content: String,
}

pub struct FileSearcher;

impl FileSearcher {
    pub fn search_in_file(
        file_path: &str,
        pattern: &str,
        max_results: usize,
    ) -> Result<Vec<SearchResult>> {
        let file = File::open(file_path)
            .with_context(|| format!("Failed to open file for searching: {}", file_path))?;
        let mmap = unsafe { Mmap::map(&file) }
            .with_context(|| format!("Failed to memory map file for searching: {}", file_path))?;

        let re = Regex::new(pattern)
            .with_context(|| format!("Invalid regex pattern: {}", pattern))?;

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
