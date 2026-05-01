use libloading::Library;
use std::collections::HashMap;
use std::path::Path;
use tree_sitter::{Language, Parser};

pub struct ParserLoader {
    loaded_libraries: HashMap<String, Library>,
    cached_languages: HashMap<String, Language>,
}

impl ParserLoader {
    pub fn new() -> Self {
        ParserLoader {
            loaded_libraries: HashMap::new(),
            cached_languages: HashMap::new(),
        }
    }

    pub fn get_language(
        &mut self,
        parser_name: &str,
        binary_path: &Path,
    ) -> Result<Language, Box<dyn std::error::Error>> {
        if let Some(lang) = self.cached_languages.get(parser_name) {
            return Ok(lang.clone());
        }
        let lang = unsafe { self.load_language(parser_name, binary_path)? };
        self.cached_languages.insert(parser_name.to_string(), lang.clone());
        Ok(lang)
    }

    pub unsafe fn load_language(
        &mut self,
        parser_name: &str,
        binary_path: &Path,
    ) -> Result<Language, Box<dyn std::error::Error>> {
        let library = Library::new(binary_path)?;
        let func_name = format!("tree_sitter_{}", parser_name.replace('-', "_"));
        let lang_fn: libloading::Symbol<unsafe extern "C" fn() -> Language> =
            library.get(func_name.as_bytes())?;
        let language = lang_fn();
        self.loaded_libraries.insert(parser_name.to_string(), library);
        Ok(language)
    }

    pub fn get_parser(
        &mut self,
        parser_name: &str,
        binary_path: &Path,
    ) -> Result<Parser, Box<dyn std::error::Error>> {
        let language = self.get_language(parser_name, binary_path)?;
        let mut parser = Parser::new();
        parser.set_language(&language)?;
        Ok(parser)
    }
}
