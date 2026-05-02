//! Infrastructure-level plugin support.
//!
//! Contains the Lua runtime ([`runtime`]) and theme data types ([`themes`]).

pub mod runtime;
pub mod themes;

#[cfg(test)]
mod tests {
    /// Smoke-test: sub-modules compile and can be referenced.
    #[test]
    fn submodules_exist() {
        let _ = stringify!(super::runtime::PluginRuntime);
        let _ = stringify!(super::themes::ThemeDefinition);
    }
}
