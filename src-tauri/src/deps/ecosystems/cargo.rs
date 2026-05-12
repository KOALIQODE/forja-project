use super::*;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

pub struct CargoHandler;

impl EcosystemHandler for CargoHandler {
    fn name(&self) -> &'static str { "cargo" }
    fn language(&self) -> &'static str { "Rust" }
    fn manifest_filenames(&self) -> &'static [&'static str] { &["Cargo.toml"] }

    fn parse_dependencies(&self, path: &Path) -> Result<Vec<Dependency>, String> {
        let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        let val: toml::Value = toml::from_str(&text).map_err(|e| e.to_string())?;
        let mut deps = vec![];
        for (section, dtype) in [
            ("dependencies","prod"),("dev-dependencies","dev"),("build-dependencies","build")
        ] {
            if let Some(table) = val.get(section).and_then(|v| v.as_table()) {
                for (name, spec) in table {
                    let version = match spec {
                        toml::Value::String(s) => s.trim_start_matches(['^','~',' ']).to_string(),
                        toml::Value::Table(t) => t.get("version")
                            .and_then(|v| v.as_str()).unwrap_or("*")
                            .trim_start_matches(['^','~',' ']).to_string(),
                        _ => "*".to_string(),
                    };
                    // Saltar deps de path local (no tienen versión en registry)
                    if let toml::Value::Table(t) = spec {
                        if t.contains_key("path") { continue; }
                    }
                    deps.push(Dependency {
                        name: name.clone(), version, dep_type: dtype.to_string(),
                        latest: None, is_outdated: false, vulnerabilities: vec![],
                    });
                }
            }
        }
        Ok(deps)
    }

    fn run_audit(&self, path: &Path) -> Vec<(String, Vec<Vulnerability>)> {
        let dir = path.parent().unwrap();
        let out = Command::new("cargo").args(["audit","--json"]).current_dir(dir).output();
        let Ok(out) = out else { return vec![] };
        let text = String::from_utf8_lossy(&out.stdout);
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };
        let mut map: HashMap<String, Vec<Vulnerability>> = HashMap::new();
        if let Some(list) = json.pointer("/vulnerabilities/list").and_then(|v| v.as_array()) {
            for vuln in list {
                let pkg = vuln.pointer("/package/name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let id = vuln.pointer("/advisory/id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let title = vuln.pointer("/advisory/title").and_then(|v| v.as_str()).unwrap_or("Advisory").to_string();
                let url = vuln.pointer("/advisory/url").and_then(|v| v.as_str()).map(String::from);
                let score = vuln.pointer("/advisory/cvss/score").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let sev = match score as u32 { 9..=10 => Severity::Critical, 7..=8 => Severity::High,
                    4..=6 => Severity::Moderate, 1..=3 => Severity::Low, _ => Severity::Unknown };
                let patched = vuln.pointer("/versions/patched").and_then(|v| v.as_array())
                    .and_then(|a| a.first()).and_then(|v| v.as_str()).map(String::from);
                map.entry(pkg).or_default().push(Vulnerability {
                    id, severity: sev, title, description: None, url, patched_versions: patched,
                });
            }
        }
        map.into_iter().collect()
    }

    fn check_outdated(&self, path: &Path) -> Vec<(String, String)> {
        let dir = path.parent().unwrap();
        let out = Command::new("cargo").args(["outdated","--output","json"]).current_dir(dir).output();
        let Ok(out) = out else { return vec![] };
        let text = String::from_utf8_lossy(&out.stdout);
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };
        json.get("dependencies").and_then(|v| v.as_array()).unwrap_or(&vec![]).iter().filter_map(|d| {
            let name = d.get("name").and_then(|v| v.as_str())?;
            let latest = d.get("latest").and_then(|v| v.as_str())?;
            if latest == "---" { return None; }
            Some((name.to_string(), latest.to_string()))
        }).collect()
    }

    fn install(&self, path: &Path, package: &str, version: Option<&str>, dev: bool) -> Result<String, String> {
        let dir = path.parent().unwrap();
        let spec = version.map(|v| format!("{}@{}", package, v)).unwrap_or(package.to_string());
        let mut args = vec!["add", &spec];
        if dev { args.push("--dev"); }
        run_cmd("cargo", &args, dir)
    }

    fn validate_dependency(&self, package: &str, version: Option<&str>) -> Result<Vec<Vulnerability>, String> {
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

        let report = self.run_audit(&cargo_toml_path);
        Ok(report.into_iter().flat_map(|(_, v)| v).collect())
    }
}
