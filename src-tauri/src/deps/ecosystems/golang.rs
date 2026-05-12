use super::*;
use std::path::Path;
use std::process::Command;

pub struct GoHandler;

impl EcosystemHandler for GoHandler {
    fn name(&self) -> &'static str { "go" }
    fn language(&self) -> &'static str { "Go" }
    fn manifest_filenames(&self) -> &'static [&'static str] { &["go.mod"] }

    fn parse_dependencies(&self, path: &Path) -> Result<Vec<Dependency>, String> {
        let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        let mut deps = vec![];
        let mut in_require = false;
        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed == "require (" { in_require = true; continue; }
            if trimmed == ")" { in_require = false; continue; }
            if in_require || trimmed.starts_with("require ") {
                let part = trimmed.trim_start_matches("require ");
                let parts: Vec<&str> = part.split_whitespace().collect();
                if parts.len() >= 2 {
                    let is_indirect = parts.get(2).map(|s| s.contains("indirect")).unwrap_or(false);
                    deps.push(Dependency {
                        name: parts[0].to_string(),
                        version: parts[1].to_string(),
                        dep_type: if is_indirect { "indirect" } else { "prod" }.to_string(),
                        latest: None, is_outdated: false, vulnerabilities: vec![],
                    });
                }
            }
        }
        Ok(deps)
    }

    fn run_audit(&self, path: &Path) -> Vec<(String, Vec<Vulnerability>)> {
        // govulncheck -json ./...
        let dir = path.parent().unwrap();
        let out = Command::new("govulncheck").args(["-json","./..."]).current_dir(dir).output();
        let Ok(out) = out else { return vec![] };
        // govulncheck emite JSON por líneas (NDJSON)
        let mut map: std::collections::HashMap<String, Vec<Vulnerability>> = Default::default();
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            let Ok(json) = serde_json::from_str::<serde_json::Value>(line) else { continue };
            if let Some(finding) = json.get("finding") {
                let osv_id = finding.get("osv").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let pkg = finding.pointer("/trace/0/module")
                    .and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
                let fixed = finding.get("fixed_version").and_then(|v| v.as_str()).map(String::from);
                map.entry(pkg).or_default().push(Vulnerability {
                    id: osv_id.clone(),
                    severity: Severity::Unknown,
                    title: format!("Go vulnerability {}", osv_id),
                    description: None, url: Some(format!("https://pkg.go.dev/vuln/{}", osv_id)),
                    patched_versions: fixed,
                });
            }
        }
        map.into_iter().collect()
    }

    fn check_outdated(&self, path: &Path) -> Vec<(String, String)> {
        // go list -u -m -json all
        let dir = path.parent().unwrap();
        let out = Command::new("go").args(["list","-u","-m","-json","all"]).current_dir(dir).output();
        let Ok(out) = out else { return vec![] };
        let text = String::from_utf8_lossy(&out.stdout);
        // go emite múltiples objetos JSON
        let mut results = vec![];
        let wrapped = format!("[{}]", text.replace("}\n{", "},\n{"));
        let Ok(arr) = serde_json::from_str::<serde_json::Value>(&wrapped) else { return vec![] };
        if let Some(mods) = arr.as_array() {
            for m in mods {
                if let (Some(path), Some(update)) = (
                    m.get("Path").and_then(|v| v.as_str()),
                    m.get("Update").and_then(|u| u.get("Version")).and_then(|v| v.as_str())
                ) {
                    results.push((path.to_string(), update.to_string()));
                }
            }
        }
        results
    }

    fn install(&self, path: &Path, package: &str, version: Option<&str>, _dev: bool) -> Result<String, String> {
        let dir = path.parent().unwrap();
        let spec = version.map(|v| format!("{}@{}", package, v)).unwrap_or(format!("{}@latest", package));
        run_cmd("go", &["get", &spec], dir)
    }
}
