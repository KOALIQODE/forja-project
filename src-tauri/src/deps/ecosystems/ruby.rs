use super::*;
use std::path::Path;
use std::process::Command;

pub struct RubyHandler;

impl EcosystemHandler for RubyHandler {
    fn name(&self) -> &'static str { "bundler" }
    fn language(&self) -> &'static str { "Ruby" }
    fn manifest_filenames(&self) -> &'static [&'static str] { &["Gemfile"] }

    fn parse_dependencies(&self, path: &Path) -> Result<Vec<Dependency>, String> {
        let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        let mut deps = vec![];
        for line in text.lines() {
            let t = line.trim();
            if t.starts_with("gem ") {
                let parts: Vec<&str> = t.splitn(3, ',').collect();
                let name = parts[0].trim_start_matches("gem ")
                    .trim_matches(['"', '\'', ' ']).to_string();
                let version = parts.get(1)
                    .map(|v| v.trim().trim_matches(['"', '\'', ' ']).to_string())
                    .unwrap_or("*".to_string());
                deps.push(Dependency {
                    name, version, dep_type: "prod".to_string(),
                    latest: None, is_outdated: false, vulnerabilities: vec![],
                });
            }
        }
        Ok(deps)
    }

    fn run_audit(&self, path: &Path) -> Vec<(String, Vec<Vulnerability>)> {
        // bundle-audit check --format json (gem install bundler-audit)
        let dir = path.parent().unwrap();
        let out = Command::new("bundle-audit").args(["check","--format","json"]).current_dir(dir).output();
        let Ok(out) = out else { return vec![] };
        let text = String::from_utf8_lossy(&out.stdout);
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };
        let mut map: std::collections::HashMap<String, Vec<Vulnerability>> = Default::default();
        if let Some(vulns) = json.get("results").and_then(|v| v.as_array()) {
            for v in vulns {
                let pkg = v.pointer("/gem/name").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let id = v.pointer("/advisory/id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                let title = v.pointer("/advisory/title").and_then(|x| x.as_str()).unwrap_or("Advisory").to_string();
                let sev = match v.pointer("/advisory/criticality").and_then(|x| x.as_str()) {
                    Some("high")   => Severity::High,
                    Some("medium") => Severity::Moderate,
                    Some("low")    => Severity::Low,
                    _ => Severity::Unknown,
                };
                map.entry(pkg).or_default().push(Vulnerability {
                    id, severity: sev, title, description: None, url: None, patched_versions: None,
                });
            }
        }
        map.into_iter().collect()
    }

    fn check_outdated(&self, path: &Path) -> Vec<(String, String)> {
        let dir = path.parent().unwrap();
        let out = Command::new("bundle").args(["outdated","--parseable"]).current_dir(dir).output();
        let Ok(out) = out else { return vec![] };
        String::from_utf8_lossy(&out.stdout).lines().filter_map(|line| {
            // formato: "outdated! gem (x.y.z > a.b.c)"
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 { Some((parts[1].to_string(), parts.last().unwrap_or(&"").to_string())) }
            else { None }
        }).collect()
    }

    fn install(&self, path: &Path, package: &str, version: Option<&str>, _dev: bool) -> Result<String, String> {
        let dir = path.parent().unwrap();
        let args: Vec<&str> = if let Some(v) = version {
            vec!["add", package, "--version", v]
        } else {
            vec!["add", package]
        };
        run_cmd("bundle", &args, dir)
    }
}
