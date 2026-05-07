use super::*;
use std::process::Command;
use crate::infrastructure::security::{EcosystemReport, ScanOptions, SeverityCounts, VulnEntry, is_tool_available};
use chrono::Utc;

pub struct NpmHandler;

impl EcosystemHandler for NpmHandler {
    fn name(&self) -> &'static str { "npm" }

    fn required_tools(&self) -> Vec<String> {
        vec!["npm".to_string()]
    }

    fn run_audit(&self, project_path: &Path, options: &ScanOptions) -> EcosystemReport {
        let lockfile = "package-lock.json".to_string();
        
        if options.parse_only {
            // Placeholder: currently we don't have a pure JS parser for package-lock.json here
            // We could implement one or use a tool. For now, if parse_only is requested,
            // we might just return empty or do a lightweight check.
            return EcosystemReport {
                ecosystem: self.name().to_string(),
                lockfile,
                counts: SeverityCounts::default(),
                vulnerabilities: vec![],
                tool_missing: false,
                tools_required: self.required_tools(),
                error: None,
                scanned_at: Utc::now(),
            };
        }

        if !is_tool_available("npm") {
            return EcosystemReport {
                ecosystem: self.name().to_string(),
                lockfile,
                counts: SeverityCounts::default(),
                vulnerabilities: vec![],
                tool_missing: true,
                tools_required: self.required_tools(),
                error: Some("npm not found".to_string()),
                scanned_at: Utc::now(),
            };
        }

        let out = Command::new("npm")
            .args(["audit", "--json", "--prefix", &project_path.to_string_lossy()])
            .current_dir(project_path)
            .output();

        match out {
            Ok(output) => {
                let mut report = crate::commands::security::parse_npm_audit_json(&output.stdout)
                    .unwrap_or_else(|e| EcosystemReport {
                        ecosystem: self.name().to_string(),
                        lockfile: lockfile.clone(),
                        counts: SeverityCounts::default(),
                        vulnerabilities: vec![],
                        tool_missing: false,
                        tools_required: self.required_tools(),
                        error: Some(e),
                        scanned_at: Utc::now(),
                    });
                report.ecosystem = self.name().to_string();
                report.lockfile = lockfile;
                report.scanned_at = Utc::now();
                report
            }
            Err(e) => EcosystemReport {
                ecosystem: self.name().to_string(),
                lockfile,
                counts: SeverityCounts::default(),
                vulnerabilities: vec![],
                tool_missing: false,
                tools_required: self.required_tools(),
                error: Some(e.to_string()),
                scanned_at: Utc::now(),
            },
        }
    }

    fn validate_dependency(&self, package: &str, version: Option<&str>) -> Result<Vec<VulnEntry>, String> {
        // Implementation for pre-install validation
        // One way: create a temp package.json, run npm audit
        let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
        let pkg_json_path = temp_dir.path().join("package.json");
        
        let version_str = version.unwrap_or("latest");
        let content = format!(r#"{{"dependencies": {{"{}": "{}"}}}}"#, package, version_str);
        std::fs::write(&pkg_json_path, content).map_err(|e| e.to_string())?;

        // npm audit needs a lockfile usually, or at least to be able to resolve
        // We might need to run `npm install --package-lock-only` first
        let _ = Command::new("npm")
            .args(["install", "--package-lock-only"])
            .current_dir(temp_dir.path())
            .output();

        let out = Command::new("npm")
            .args(["audit", "--json"])
            .current_dir(temp_dir.path())
            .output()
            .map_err(|e| e.to_string())?;

        let report = crate::commands::security::parse_npm_audit_json(&out.stdout)?;
        Ok(report.vulnerabilities)
    }
}
