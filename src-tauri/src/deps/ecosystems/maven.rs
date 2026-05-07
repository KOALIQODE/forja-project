use super::*;
use std::path::Path;
use std::process::Command;

pub struct MavenHandler;

impl EcosystemHandler for MavenHandler {
    fn name(&self) -> &'static str { "maven" }
    fn language(&self) -> &'static str { "Java / Kotlin" }
    fn manifest_filenames(&self) -> &'static [&'static str] { &["pom.xml"] }

    fn parse_dependencies(&self, path: &Path) -> Result<Vec<Dependency>, String> {
        let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        // Parser XML simple con regex-like (sin dependencia extra)
        let mut deps = vec![];
        // Extraer bloques <dependency>...</dependency>
        let mut remaining = text.as_str();
        while let Some(start) = remaining.find("<dependency>") {
            remaining = &remaining[start + "<dependency>".len()..];
            if let Some(end) = remaining.find("</dependency>") {
                let block = &remaining[..end];
                let group_id = extract_xml_tag(block, "groupId").unwrap_or_default();
                let artifact_id = extract_xml_tag(block, "artifactId").unwrap_or_default();
                let version = extract_xml_tag(block, "version").unwrap_or_else(|| "managed".to_string());
                let scope = extract_xml_tag(block, "scope").unwrap_or_else(|| "compile".to_string());
                if !artifact_id.is_empty() {
                    deps.push(Dependency {
                        name: format!("{}:{}", group_id, artifact_id),
                        version,
                        dep_type: scope,
                        latest: None, is_outdated: false, vulnerabilities: vec![],
                    });
                }
                remaining = &remaining[end..];
            } else { break; }
        }
        Ok(deps)
    }

    fn run_audit(&self, path: &Path) -> Vec<(String, Vec<Vulnerability>)> {
        // mvn org.owasp:dependency-check-maven:check -Dformat=JSON
        let dir = path.parent().unwrap();
        let _ = Command::new("mvn")
            .args(["org.owasp:dependency-check-maven:check","-Dformat=JSON","-DprettyPrint=true"])
            .current_dir(dir).output();
        // Leer target/dependency-check-report.json
        let report = dir.join("target/dependency-check-report.json");
        let Ok(text) = std::fs::read_to_string(&report) else { return vec![] };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };
        let mut map: std::collections::HashMap<String, Vec<Vulnerability>> = Default::default();
        if let Some(deps) = json.pointer("/dependencies").and_then(|v| v.as_array()) {
            for dep in deps {
                let pkg = dep.get("fileName").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
                if let Some(vulns) = dep.get("vulnerabilities").and_then(|v| v.as_array()) {
                    for v in vulns {
                        let id = v.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        let sev = match v.get("severity").and_then(|x| x.as_str()).unwrap_or("") {
                            "CRITICAL" => Severity::Critical, "HIGH" => Severity::High,
                            "MEDIUM"   => Severity::Moderate, "LOW"  => Severity::Low,
                            _ => Severity::Unknown,
                        };
                        let desc = v.get("description").and_then(|x| x.as_str()).map(String::from);
                        map.entry(pkg.clone()).or_default().push(Vulnerability {
                            id, severity: sev, title: desc.clone().unwrap_or("CVE found".to_string()),
                            description: desc, url: None, patched_versions: None,
                        });
                    }
                }
            }
        }
        map.into_iter().collect()
    }

    fn check_outdated(&self, path: &Path) -> Vec<(String, String)> {
        // mvn versions:display-dependency-updates -DprocessDependencyManagement=false
        let dir = path.parent().unwrap();
        let out = Command::new("mvn")
            .args(["versions:display-dependency-updates","-DprocessDependencyManagement=false"])
            .current_dir(dir).output();
        // Parsear stdout texto plano
        let Ok(out) = out else { return vec![] };
        let text = String::from_utf8_lossy(&out.stdout);
        let mut results = vec![];
        for line in text.lines() {
            // [INFO]   groupId:artifactId ... X.Y.Z -> A.B.C
            if line.contains("->") {
                let parts: Vec<&str> = line.split("->").collect();
                if parts.len() == 2 {
                    let pkg = parts[0].trim().split_whitespace().last().unwrap_or("").to_string();
                    let latest = parts[1].trim().to_string();
                    if !pkg.is_empty() { results.push((pkg, latest)); }
                }
            }
        }
        results
    }

    fn install(&self, _path: &Path, package: &str, _version: Option<&str>, _dev: bool) -> Result<String, String> {
        Err(format!("Para Maven, agrega manualmente en pom.xml: <dependency>{}</dependency>", package))
    }
}

fn extract_xml_tag(block: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = block.find(&open)? + open.len();
    let end = block.find(&close)?;
    if start < end { Some(block[start..end].trim().to_string()) } else { None }
}
