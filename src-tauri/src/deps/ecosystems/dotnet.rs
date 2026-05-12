use super::*;
use std::path::Path;
use std::process::Command;

pub struct DotNetHandler;

impl EcosystemHandler for DotNetHandler {
    fn name(&self) -> &'static str { "nuget" }
    fn language(&self) -> &'static str { ".NET / C#" }
    fn manifest_filenames(&self) -> &'static [&'static str] { &["*.csproj", "*.fsproj", "packages.config"] }

    fn parse_dependencies(&self, path: &Path) -> Result<Vec<Dependency>, String> {
        let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        let mut deps = vec![];
        // <PackageReference Include="..." Version="..." />
        let mut remaining = text.as_str();
        while let Some(pos) = remaining.to_lowercase().find("packagereference") {
            remaining = &remaining[pos..];
            let end = remaining.find('>').unwrap_or(remaining.len());
            let tag = &remaining[..end];
            if let (Some(name), Some(version)) = (
                extract_attr(tag, "Include").or_else(|| extract_attr(tag, "include")),
                extract_attr(tag, "Version").or_else(|| extract_attr(tag, "version"))
            ) {
                deps.push(Dependency {
                    name, version, dep_type: "prod".to_string(),
                    latest: None, is_outdated: false, vulnerabilities: vec![],
                });
            }
            remaining = &remaining[1..];
        }
        Ok(deps)
    }

    fn run_audit(&self, path: &Path) -> Vec<(String, Vec<Vulnerability>)> {
        let dir = path.parent().unwrap();
        let out = Command::new("dotnet")
            .args(["list", path.to_str().unwrap_or("."), "package", "--vulnerable", "--format", "json"])
            .current_dir(dir).output();
        let Ok(out) = out else { return vec![] };
        let text = String::from_utf8_lossy(&out.stdout);
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };
        let mut map: std::collections::HashMap<String, Vec<Vulnerability>> = Default::default();
        if let Some(projects) = json.get("projects").and_then(|v| v.as_array()) {
            for proj in projects {
                for fw in proj.get("frameworks").and_then(|v| v.as_array()).unwrap_or(&vec![]) {
                    for pkg in fw.get("topLevelPackages").and_then(|v| v.as_array()).unwrap_or(&vec![]) {
                        let name = pkg.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        if let Some(vulns) = pkg.get("vulnerabilities").and_then(|v| v.as_array()) {
                            for v in vulns {
                                let sev = match v.get("severity").and_then(|x| x.as_str()).unwrap_or("") {
                                    "Critical" => Severity::Critical, "High" => Severity::High,
                                    "Moderate" => Severity::Moderate, "Low" => Severity::Low,
                                    _ => Severity::Unknown,
                                };
                                map.entry(name.clone()).or_default().push(Vulnerability {
                                    id: v.get("advisoryurl").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                                    severity: sev,
                                    title: format!("{} vulnerability", name),
                                    description: None,
                                    url: v.get("advisoryurl").and_then(|x| x.as_str()).map(String::from),
                                    patched_versions: None,
                                });
                            }
                        }
                    }
                }
            }
        }
        map.into_iter().collect()
    }

    fn check_outdated(&self, path: &Path) -> Vec<(String, String)> {
        let dir = path.parent().unwrap();
        let out = Command::new("dotnet")
            .args(["list", path.to_str().unwrap_or("."), "package", "--outdated", "--format", "json"])
            .current_dir(dir).output();
        let Ok(out) = out else { return vec![] };
        let text = String::from_utf8_lossy(&out.stdout);
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };
        let mut results = vec![];
        if let Some(projects) = json.get("projects").and_then(|v| v.as_array()) {
            for proj in projects {
                for fw in proj.get("frameworks").and_then(|v| v.as_array()).unwrap_or(&vec![]) {
                    for pkg in fw.get("topLevelPackages").and_then(|v| v.as_array()).unwrap_or(&vec![]) {
                        let name = pkg.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let latest = pkg.get("latestVersion").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        if !name.is_empty() && !latest.is_empty() { results.push((name, latest)); }
                    }
                }
            }
        }
        results
    }

    fn install(&self, path: &Path, package: &str, version: Option<&str>, _dev: bool) -> Result<String, String> {
        let dir = path.parent().unwrap();
        let mut args = vec!["add", path.to_str().unwrap_or("."), "package", package];
        let ver_str;
        if let Some(v) = version {
            ver_str = v.to_string();
            args.extend_from_slice(&["--version", &ver_str]);
        }
        run_cmd("dotnet", &args, dir)
    }
}

fn extract_attr(tag: &str, attr: &str) -> Option<String> {
    let needle = format!("{}=\"", attr);
    let start = tag.find(&needle)? + needle.len();
    let end = tag[start..].find('"')? + start;
    Some(tag[start..end].to_string())
}
