pub mod cache;
pub mod compiler;
pub mod downloader;
pub mod loader;
pub mod manager;
pub mod registry;
pub mod updater;
pub mod validator;

#[cfg(test)]
mod tests {
    /// Smoke-test: all sub-modules compile and can be referenced.
    #[test]
    fn all_submodules_exist() {
        // If this compiles, the sub-modules are present and well-formed.
        let _ = stringify!(super::cache::CacheManager);
        let _ = stringify!(super::compiler::ParserCompiler);
        let _ = stringify!(super::downloader::BinaryDownloader);
        let _ = stringify!(super::loader::ParserLoader);
        let _ = stringify!(super::manager::ParserManager);
        let _ = stringify!(super::registry::PARSER_REGISTRY);
        let _ = stringify!(super::updater::ParserUpdater);
        let _ = stringify!(super::validator::BinaryValidator);
    }
}
