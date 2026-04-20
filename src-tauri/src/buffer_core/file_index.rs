use std::fs::File;
use std::sync::{Arc, LazyLock};

use anyhow::{Context, Result};
use dashmap::DashMap;
use memmap2::Mmap;

static FILE_CACHE: LazyLock<DashMap<String, Arc<FileIndex>>> = LazyLock::new(DashMap::new);

use memchr::Memchr;

pub struct FileIndex {
    mmap: Mmap,
    line_offsets: Vec<usize>,
}

impl FileIndex {
    pub fn new(path: String) -> Result<Self> {
        let file = File::open(&path)
            .with_context(|| format!("Failed to open file: {}", path))?;
        let mmap = unsafe { Mmap::map(&file) }
            .with_context(|| format!("Failed to memory map file: {}", path))?;

        // SIMD optimized line indexing
        let mut line_offsets = vec![0];
        let iter = Memchr::new(b'\n', &mmap);
        for pos in iter {
            if pos + 1 < mmap.len() {
                line_offsets.push(pos + 1);
            }
        }

        Ok(Self {
            mmap,
            line_offsets,
        })
    }

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

    pub fn total_lines(&self) -> Result<u32> {
        Ok(self.line_offsets.len() as u32)
    }

    fn read_line_at_offset(&self, offset: usize) -> Result<String> {
        if offset >= self.mmap.len() {
            return Ok(String::new());
        }

        let end_offset;
        // Find next newline or end of file
        let remaining = &self.mmap[offset..];
        if let Some(pos) = memchr::memchr(b'\n', remaining) {
            end_offset = offset + pos;
        } else {
            end_offset = self.mmap.len();
        }

        let slice_end = if end_offset > offset && self.mmap[end_offset - 1] == b'\r' {
            end_offset - 1
        } else {
            end_offset
        };

        Ok(String::from_utf8_lossy(&self.mmap[offset..slice_end]).into_owned())
    }
}

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
