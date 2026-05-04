use std::path::PathBuf;
use std::fs;

pub struct CacheManager {
    pub cache_dir: PathBuf,
}

impl CacheManager {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let cache_dir = Self::get_cache_dir()?;
        fs::create_dir_all(&cache_dir)?;
        fs::create_dir_all(cache_dir.join("parsers"))?;
        fs::create_dir_all(cache_dir.join("downloads"))?;
        fs::create_dir_all(cache_dir.join("metadata"))?;
        Ok(CacheManager { cache_dir })
    }

    fn get_cache_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
        #[cfg(target_os = "windows")]
        {
            let local_appdata = std::env::var("LOCALAPPDATA")?;
            Ok(PathBuf::from(local_appdata).join("forja"))
        }
        #[cfg(target_os = "macos")]
        {
            let home = std::env::var("HOME")?;
            Ok(PathBuf::from(home).join("Library").join("Application Support").join("forja"))
        }
        #[cfg(target_os = "linux")]
        {
            let home = std::env::var("HOME")?;
            Ok(PathBuf::from(home).join(".local").join("share").join("forja"))
        }
    }

    pub fn parser_dir(&self, parser_name: &str) -> PathBuf {
        self.cache_dir.join("parsers").join(parser_name)
    }

    pub fn binary_path(&self, parser_name: &str) -> PathBuf {
        let mut path = self.parser_dir(parser_name).join("parser");
        #[cfg(target_os = "windows")]
        path.set_extension("dll");
        #[cfg(target_os = "macos")]
        path.set_extension("dylib");
        #[cfg(target_os = "linux")]
        path.set_extension("so");
        path
    }

    pub fn queries_path(&self, parser_name: &str) -> PathBuf {
        self.cache_dir.join("parsers").join(parser_name).join("highlights.scm")
    }

    pub fn is_parser_installed(&self, parser_name: &str) -> bool {
        self.binary_path(parser_name).exists()
    }

    pub fn is_parser_ready(&self, parser_name: &str) -> bool {
        self.binary_path(parser_name).exists() && self.queries_path(parser_name).exists()
    }

    pub fn metadata_path(&self, parser_name: &str) -> PathBuf {
        self.cache_dir.join("metadata").join(format!("{}.json", parser_name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    /// Create a `CacheManager` pointing at the system temp dir — no disk writes needed.
    fn fake_cache() -> CacheManager {
        CacheManager { cache_dir: env::temp_dir() }
    }

    #[test]
    fn binary_path_ends_with_parser_so() {
        let cm = fake_cache();
        let path = cm.binary_path("rust");
        #[cfg(target_os = "linux")]
        assert!(path.to_string_lossy().ends_with("parser.so"), "got: {:?}", path);
        #[cfg(target_os = "macos")]
        assert!(path.to_string_lossy().ends_with("parser.dylib"), "got: {:?}", path);
        #[cfg(target_os = "windows")]
        assert!(path.to_string_lossy().ends_with("parser.dll"), "got: {:?}", path);
    }

    #[test]
    fn queries_path_ends_with_highlights_scm() {
        let cm = fake_cache();
        let path = cm.queries_path("rust");
        assert!(
            path.to_string_lossy().ends_with("highlights.scm"),
            "got: {:?}", path
        );
    }

    #[test]
    fn metadata_path_ends_with_parser_name_json() {
        let cm = fake_cache();
        let path = cm.metadata_path("my_parser");
        assert!(
            path.to_string_lossy().ends_with("my_parser.json"),
            "got: {:?}", path
        );
    }

    #[test]
    fn parser_dir_contains_parser_name() {
        let cm = fake_cache();
        let dir = cm.parser_dir("my_special_parser");
        assert!(
            dir.to_string_lossy().contains("my_special_parser"),
            "got: {:?}", dir
        );
    }

    #[test]
    fn is_parser_installed_returns_false_for_nonexistent() {
        let cm = fake_cache();
        assert!(!cm.is_parser_installed("nonexistent_parser_xyz_12345"));
    }
}
