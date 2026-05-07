use super::*;
use std::process::Command;
use crate::infrastructure::security::{EcosystemReport, ScanOptions, SeverityCounts, VulnEntry, is_tool_available};
use chrono::Utc;

pub struct CargoHandler;

impl EcosystemHandler for CargoHandler {
    fn name(&self) -> &'static str { "cargo" }

    fn required_tools(&self) -> Vec<String> {
        vec!["cargo".to_string(), "cargo-audit".to_string()]
    }

    fn run_audit(&self, project_path: &Path, options: &ScanOptions) -> EcosystemReport {
        let lockfile = "Cargo.lock".to_string();

        if options.parse_only {
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

        if !is_tool_available("cargo") {
            return EcosystemReport {
                ecosystem: self.name().to_string(),
                lockfile,
                counts: SeverityCounts::default(),
                vulnerabilities: vec![],
                tool_missing: true,
                tools_required: self.required_tools(),
                error: Some("cargo not found".to_string()),
                scanned_at: Utc::now(),
            };
        }

        // cargo audit is a sub-tool
        let out = Command::new("cargo")
            .args(["audit", "--json"])
            .current_dir(project_path)
            .output();

        match out {
            Ok(output) => {
                let mut report = crate::commands::security::parse_cargo_audit_json(&output.stdout)
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
        // cargo-audit doesn't easily audit a single package without a crate.
        // We can use `cargo-advisory` or similar, but for now we'll do the same temp crate trick.
        let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
        let cargo_toml_path = temp_dir.path().join("Cargo.toml");
        
        let version_str = version.unwrap_or("*");
        let content = format!(r#"[package]
name = "temp-val"
version = "0.1.0"
edition = "2021"

[dependencies]
{} = "{}"
"#, package, version_str);
        std::fs::write(&cargo_toml_path, content).map_err(|e| e.to_string())?;

        // Need to generate lockfile
        let _ = Command::new("cargo")
            .args(["generate-lockfile"])
            .current_dir(temp_dir.path())
            .output();

        let out = Command::new("cargo")
            .args(["audit", "--json"])
            .current_dir(temp_dir.path())
            .output()
            .map_err(|e| e.to_string())?;

        let report = crate::commands::security::parse_cargo_audit_json(&out.stdout)?;
        Ok(report.vulnerabilities)
    }
}
