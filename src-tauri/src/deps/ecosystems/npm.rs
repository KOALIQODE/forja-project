use super::*;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

pub struct NpmHandler;

impl EcosystemHandler for NpmHandler {
    fn name(&self) -> &'static str { "npm" }
    fn language(&self) -> &'static str { "JavaScript / TypeScript" }
    fn manifest_filenames(&self) -> &'static [&'static str] {
        &["package.json"]
    }

    fn parse_dependencies(&self, path: &Path) -> Result<Vec<Dependency>, String> {
        let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        let mut deps = Vec::new();
        for section in ["dependencies","devDependencies","peerDependencies","optionalDependencies"] {
            let dtype = match section {
                "devDependencies"      => "dev",
                "peerDependencies"     => "peer",
                "optionalDependencies" => "optional",
                _                      => "prod",
            };
            if let Some(obj) = json.get(section).and_then(|v| v.as_object()) {
                for (name, ver) in obj {
                    deps.push(Dependency {
                        name: name.clone(),
                        version: clean_version(ver.as_str().unwrap_or("*")),
                        dep_type: dtype.to_string(),
                        latest: None, is_outdated: false, vulnerabilities: Vec::new(),
                    });
                }
            }
        }
        Ok(deps)
    }

    fn run_audit(&self, path: &Path) -> Vec<(String, Vec<Vulnerability>)> {
        let dir = path.parent().unwrap();
        let out = Command::new("npm").args(["audit","--json"]).current_dir(dir).output();
        let Ok(out) = out else { return vec![] };
        let text = String::from_utf8_lossy(&out.stdout);
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };
        let mut map: HashMap<String, Vec<Vulnerability>> = HashMap::new();
        if let Some(vulns) = json.get("vulnerabilities").and_then(|v| v.as_object()) {
            for (pkg, data) in vulns {
                let sev = parse_npm_severity(data.get("severity").and_then(|s| s.as_str()).unwrap_or(""));
                let title = data.get("title").and_then(|s| s.as_str()).unwrap_or("Vulnerability").to_string();
                let url = data.get("url").and_then(|s| s.as_str()).map(String::from);
                let id = data.get("cves").and_then(|v| v.as_array())
                    .and_then(|a| a.first()).and_then(|v| v.as_str())
                    .unwrap_or("GHSA-unknown").to_string();
                let patched = data.get("fixAvailable").and_then(|f| f.as_object())
                    .and_then(|o| o.get("version")).and_then(|v| v.as_str()).map(String::from);
                map.entry(pkg.clone()).or_default().push(Vulnerability {
                    id, severity: sev, title, description: None, url, patched_versions: patched,
                });
            }
        }
        map.into_iter().collect()
    }

    fn check_outdated(&self, path: &Path) -> Vec<(String, String)> {
        let dir = path.parent().unwrap();
        let out = Command::new("npm").args(["outdated","--json"]).current_dir(dir).output();
        let Ok(out) = out else { return vec![] };
        let text = String::from_utf8_lossy(&out.stdout);
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };
        json.as_object().unwrap_or(&serde_json::Map::new()).iter()
            .filter_map(|(k, v)| v.get("latest").and_then(|l| l.as_str()).map(|l| (k.clone(), l.to_string())))
            .collect()
    }

    fn install(&self, path: &Path, package: &str, version: Option<&str>, dev: bool) -> Result<String, String> {
        let dir = path.parent().unwrap();
        if let Some(v) = version {
            let v_trim = v.trim();
            if is_local_path(v_trim) {
                return Err("Installing local/file dependencies is not allowed via this interface.".to_string());
            }
            if is_git_reference(v_trim) {
                return Err("Installing git/tarball dependencies is disallowed for safety.".to_string());
            }
            if !is_exact_version(v_trim) {
                return Err("Install requires an exact version (e.g., '1.2.3'). Avoid '^', '~', 'latest' or version ranges.".to_string());
            }
        }
        let spec = version.map(|v| format!("{}@{}", package, v)).unwrap_or(package.to_string());
        let mut args = vec!["install", &spec];
        if dev { args.push("--save-dev"); }
        run_cmd("npm", &args, dir)
    }

    fn validate_dependency(&self, package: &str, version: Option<&str>) -> Result<Vec<Vulnerability>, String> {
        let version_str = version.unwrap_or("latest").trim();

        if is_local_path(version_str) {
            return Err("Local/path dependencies are not supported for validation.".to_string());
        }
        if is_git_reference(version_str) {
            return Err("Git or tarball dependencies are not supported for validation.".to_string());
        }
        if !is_exact_version(version_str) {
            return Err("Please provide an exact version (e.g., '1.2.3') for validation. Avoid '^', '~', ranges, 'latest' or wildcards.".to_string());
        }

        let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
        let pkg_json_path = temp_dir.path().join("package.json");

        let content = serde_json::json!({
            "name": "temp-val",
            "version": "1.0.0",
            "dependencies": {
                package: version_str
            }
        });
        std::fs::write(&pkg_json_path, serde_json::to_string_pretty(&content).unwrap()).map_err(|e| e.to_string())?;

        // npm audit needs a lockfile usually, or at least to be able to resolve
        let _out = Command::new("npm")
            .args(["install", "--package-lock-only"])
            .current_dir(temp_dir.path())
            .output();

        let report = self.run_audit(&pkg_json_path);
        Ok(report.into_iter().flat_map(|(_, v)| v).collect())
    }
}

fn parse_npm_severity(s: &str) -> Severity {
    match s { "critical" => Severity::Critical, "high" => Severity::High,
               "moderate" => Severity::Moderate, "low" => Severity::Low, _ => Severity::Unknown }
}

fn clean_version(v: &str) -> String {
    let s = v.trim();
    // Keep git/url/tarball/local references as-is so callers can reason about them
    if is_local_path(s) || is_git_reference(s) || s.starts_with("http://") || s.starts_with("https://") || s.contains(".tgz") || s.ends_with(".tar.gz") {
        return s.to_string();
    }
    // Remove common range prefixes but don't try to normalize complex ranges
    s.trim_start_matches(|c: char| matches!(c, '^' | '~' | '>' | '<' | '=' | ' ')).to_string()
}

// Helper checks for npm versions
fn is_local_path(v: &str) -> bool {
    let t = v.trim();
    t.starts_with("file:") || t.starts_with("./") || t.starts_with("../") || t.starts_with("/")
}

fn is_git_reference(v: &str) -> bool {
    let t = v.trim();
    t.starts_with("git+") || t.starts_with("git://") || t.starts_with("github:") || t.starts_with("git@") || (t.contains("://") && t.ends_with(".git"))
}

fn is_exact_version(version: &str) -> bool {
    let tr = version.trim();
    !tr.is_empty() && !tr.eq_ignore_ascii_case("latest") && !tr.contains(['*','^','~','>','<','=','|',',',' ']) && !tr.contains('x') && !tr.contains('X')
}
