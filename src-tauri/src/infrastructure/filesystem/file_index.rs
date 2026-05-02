//! Memory-mapped file index — O(1) random access to file lines via mmap.
//!
//! [`FileIndex`] memory-maps a file and pre-computes newline offsets so that
//! any line range can be read without seeking. A global [`DashMap`] cache means
//! the same file is only mapped once per process lifetime (until invalidated).
//!
//! This is an outbound adapter in the Hexagonal Architecture: it handles all
//! filesystem I/O for the buffer read path.

use std::fs::File;
use std::sync::{Arc, LazyLock};

use anyhow::{Context, Result};
use dashmap::DashMap;
use memmap2::Mmap;

static FILE_CACHE: LazyLock<DashMap<String, Arc<FileIndex>>> = LazyLock::new(DashMap::new);

/// A memory-mapped, line-indexed view of a single file.
pub struct FileIndex {
    mmap: Mmap,
    line_offsets: Vec<usize>,
}

impl FileIndex {
    /// Creates a new index by memory-mapping `path` and scanning for newlines.
    pub fn new(path: String) -> Result<Self> {
        let file = File::open(&path).with_context(|| format!("Failed to open file: {}", path))?;

        let mmap = unsafe { Mmap::map(&file) }
            .with_context(|| format!("Failed to memory map file: {}", path))?;

        let mut line_offsets = vec![0];

        for pos in memchr::memchr_iter(b'\n', &mmap) {
            line_offsets.push(pos + 1);
        }

        Ok(Self { mmap, line_offsets })
    }

    /// Removes a cached entry so the next access re-maps the (now-changed) file.
    pub fn invalidate(path: &str) {
        FILE_CACHE.remove(path);
    }

    /// Returns a handle from the cache, creating it on first access.
    pub fn get_or_create(path: &str) -> Result<FileIndexHandle> {
        if let Some(entry) = FILE_CACHE.get(path) {
            return Ok(FileIndexHandle {
                inner: Arc::clone(entry.value()),
            });
        }

        let index = Arc::new(FileIndex::new(path.to_string())?);
        FILE_CACHE.insert(path.to_string(), Arc::clone(&index));

        Ok(FileIndexHandle { inner: index })
    }

    /// Returns lines in the inclusive range `[start_line, end_line]` (0-based).
    pub fn read_lines(&self, start_line: u32, end_line: u32) -> Result<Vec<String>> {
        let start = start_line as usize;
        let end = end_line as usize;
        let mut lines = Vec::with_capacity(end.saturating_sub(start) + 1);

        for i in start..=end {
            if i < self.line_offsets.len() {
                let offset = self.line_offsets[i];
                lines.push(self.read_line_at_offset(offset)?);
            } else {
                break;
            }
        }

        Ok(lines)
    }

    /// Returns the total number of lines (including the sentinel after the last newline).
    pub fn total_lines(&self) -> Result<u32> {
        Ok(self.line_offsets.len() as u32)
    }

    fn read_line_at_offset(&self, offset: usize) -> Result<String> {
        if offset >= self.mmap.len() {
            return Ok(String::new());
        }

        let remaining = &self.mmap[offset..];
        let end_offset = if let Some(pos) = memchr::memchr(b'\n', remaining) {
            offset + pos
        } else {
            self.mmap.len()
        };

        Ok(String::from_utf8_lossy(&self.mmap[offset..end_offset]).into_owned())
    }
}

/// A cheaply-cloneable handle to a shared [`FileIndex`].
pub struct FileIndexHandle {
    inner: Arc<FileIndex>,
}

impl FileIndexHandle {
    pub fn read_lines(&self, start_line: u32, end_line: u32) -> Result<Vec<String>> {
        self.inner.read_lines(start_line, end_line)
    }

    pub fn total_lines(&self) -> Result<u32> {
        self.inner.total_lines()
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
    fn file_index_total_lines() {
        let (_f, path) = write_temp_file("line1\nline2\nline3\n");
        let idx = FileIndex::new(path).unwrap();
        assert_eq!(idx.total_lines().unwrap(), 4); // 3 lines + sentinel
    }

    #[test]
    fn file_index_read_lines() {
        let (_f, path) = write_temp_file("alpha\nbeta\ngamma\n");
        let idx = FileIndex::new(path).unwrap();
        let lines = idx.read_lines(0, 2).unwrap();
        assert_eq!(lines[0], "alpha");
        assert_eq!(lines[1], "beta");
        assert_eq!(lines[2], "gamma");
    }

    #[test]
    fn file_index_handle_via_cache() {
        let (_f, path) = write_temp_file("hello\nworld\n");
        FileIndex::invalidate(&path); // ensure clean state
        let handle = FileIndex::get_or_create(&path).unwrap();
        assert_eq!(handle.total_lines().unwrap(), 3);
    }
}
