use super::*;
use std::path::Path;
use std::process::Command;

pub struct ComposerHandler;

impl EcosystemHandler for ComposerHandler {
    fn name(&self) -> &'static str { "composer" }
    fn language(&self) -> &'static str { "PHP" }
    fn manifest_filenames(&self) -> &'static [&'static str] { &["composer.json"] }

    fn parse_dependencies(&self, path: &Path) -> Result<Vec<Dependency>, String> {
        let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        let mut deps = vec![];
        for (section, dtype) in [("require","prod"),("require-dev","dev")] {
            if let Some(obj) = json.get(section).and_then(|v| v.as_object()) {
                for (name, ver) in obj {
                    if name == "php" { continue; }
                    deps.push(Dependency {
                        name: name.clone(),
                        version: ver.as_str().unwrap_or("*").trim_start_matches(['^','~',' ']).to_string(),
                        dep_type: dtype.to_string(),
                        latest: None, is_outdated: false, vulnerabilities: vec![],
                    });
                }
            }
        }
        Ok(deps)
    }

    fn run_audit(&self, path: &Path) -> Vec<(String, Vec<Vulnerability>)> {
        // composer audit --format=json
        let dir = path.parent().unwrap();
        let out = Command::new("composer").args(["audit","--format=json"]).current_dir(dir).output();
        let Ok(out) = out else { return vec![] };
        let text = String::from_utf8_lossy(&out.stdout);
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };
        let mut map: std::collections::HashMap<String, Vec<Vulnerability>> = Default::default();
        if let Some(advisories) = json.get("advisories").and_then(|v| v.as_object()) {
            for (pkg, adv_list) in advisories {
                if let Some(arr) = adv_list.as_array() {
                    for adv in arr {
                        let id = adv.get("advisoryId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let title = adv.get("title").and_then(|v| v.as_str()).unwrap_or("Advisory").to_string();
                        let url = adv.get("link").and_then(|v| v.as_str()).map(String::from);
                        map.entry(pkg.clone()).or_default().push(Vulnerability {
                            id, severity: Severity::Unknown, title,
                            description: None, url, patched_versions: None,
                        });
                    }
                }
            }
        }
        map.into_iter().collect()
    }

    fn check_outdated(&self, path: &Path) -> Vec<(String, String)> {
        let dir = path.parent().unwrap();
        let out = Command::new("composer").args(["outdated","--format=json"]).current_dir(dir).output();
        let Ok(out) = out else { return vec![] };
        let text = String::from_utf8_lossy(&out.stdout);
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };
        json.get("installed").and_then(|v| v.as_array()).unwrap_or(&vec![]).iter().filter_map(|p| {
            let name = p.get("name").and_then(|v| v.as_str())?;
            let latest = p.get("latest").and_then(|v| v.as_str())?;
            Some((name.to_string(), latest.to_string()))
        }).collect()
    }

    fn install(&self, path: &Path, package: &str, version: Option<&str>, dev: bool) -> Result<String, String> {
        let dir = path.parent().unwrap();
        let spec = version.map(|v| format!("{}:{}", package, v)).unwrap_or(package.to_string());
        let mut args = vec!["require", &spec];
        if dev { args.push("--dev"); }
        run_cmd("composer", &args, dir)
    }
}
