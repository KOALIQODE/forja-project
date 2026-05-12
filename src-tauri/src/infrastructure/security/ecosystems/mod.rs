use super::*;
use std::path::Path;

pub mod npm;
pub mod cargo;
// others to be added

pub trait EcosystemHandler: Send + Sync {
    fn name(&self) -> &'static str;
    fn required_tools(&self) -> Vec<String>;
    fn run_audit(&self, project_path: &Path, options: &ScanOptions) -> EcosystemReport;
    fn validate_dependency(&self, package: &str, version: Option<&str>) -> Result<Vec<VulnEntry>, String>;
}
