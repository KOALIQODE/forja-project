# Security Scanning

Forja Studio scans dependency vulnerabilities at **two layers**:

1. **GitHub Actions** — runs on every push/PR to `main` and `dev`, plus a daily cron.
2. **In-editor real-time** — the editor watches lockfiles and re-audits automatically whenever you install a dependency, surfacing alerts without leaving the editor.

---

## Supported Ecosystems

| Ecosystem | Lockfile(s) detected | CI tool | In-editor tool |
|-----------|----------------------|---------|----------------|
| **npm** | `package-lock.json` | `npm audit` + Snyk | `npm audit --json` |
| **yarn** | `yarn.lock` | `yarn audit` + Snyk | `yarn audit --json` |
| **pnpm** | `pnpm-lock.yaml` | `pnpm audit` + Snyk | `pnpm audit --json` |
| **Rust / Cargo** | `Cargo.lock` | `cargo audit` + Snyk | `cargo audit --json` |
| **Python** | `requirements.txt`, `pyproject.toml`, `Pipfile` | `pip-audit` + Snyk | `pip-audit --format json` |
| **Go** | `go.mod` | `govulncheck` + Snyk | `govulncheck -format json ./...` |
| **Ruby** | `Gemfile.lock` | `bundler-audit` + Snyk | `bundle-audit check --format json` |

> A single project can have **multiple ecosystems** (e.g., a Tauri app has both `package-lock.json` and `Cargo.lock`). Both are scanned independently and results are aggregated.

---

## GitHub Actions — `security.yml`

### Workflow triggers

| Event | Branches |
|-------|----------|
| `push` | `main`, `dev` |
| `pull_request` | `main`, `dev` |
| `schedule` (daily 08:00 UTC) | all |

### How it works

```
push / PR
    │
    ▼
[detect] — reads the repo root for lockfiles, outputs feature flags
    │
    ├──► [scan-node]   if package-lock.json / yarn.lock / pnpm-lock.yaml
    ├──► [scan-rust]   if Cargo.lock
    ├──► [scan-python] if requirements.txt / pyproject.toml / Pipfile
    ├──► [scan-go]     if go.mod
    └──► [scan-ruby]   if Gemfile.lock
              │
              ▼ (all run in parallel)
         [security-gate] — fails the pipeline if any scanner returned failure
```

Each ecosystem scan runs **two tools**:

1. **Native audit tool** (`npm audit`, `cargo audit`, `pip-audit`, etc.) — fast, blocks the job on high/critical findings.
2. **Snyk** — deep analysis, generates a SARIF report uploaded to the GitHub **Security → Code scanning** tab.

### Security gate

The `security-gate` job runs after all scanners and **blocks merges** if any individual scan fails. This ensures no code with high/critical vulnerabilities reaches `main` or `dev`.

### Required secret

| Secret | Where to get it |
|--------|-----------------|
| `SNYK_TOKEN` | [app.snyk.io](https://app.snyk.io) → Account Settings → Auth Token |

Add it at: **Repository → Settings → Secrets and variables → Actions → New repository secret**.

> Without `SNYK_TOKEN`, the native audit tools (`npm audit`, `cargo audit`, etc.) still run and will block the pipeline on high/critical issues. Snyk steps are set to `continue-on-error: true` so they don't break CI when the token is absent — they just skip the SARIF upload.

### Viewing results

- **Failed checks**: inline on the PR, in the **Checks** tab.
- **SARIF reports**: **Security → Code scanning alerts** (requires Snyk token + GitHub Advanced Security or a public repo).

---

## In-Editor Real-Time Scanning

### Architecture

```
User opens project
        │
        ▼
watchLockfile(projectPath)          ← securityClient.ts
        │
        ├── Watches all lockfiles with notify (debounced 800 ms)
        └── Triggers initial audit immediately
                │
                ▼
        audit_dependencies(projectPath) ← Rust: commands/security.rs
                │
                ├── detect_ecosystems()  — finds all lockfiles
                ├── run_ecosystem()      — per-ecosystem tool invocation
                └── aggregate_counts()  — merges SeverityCounts
                        │
                        ▼
              Emits: "security-audit-result" (AuditReport)
                        │
                        ▼
              securityStore.ts — reactive Svelte stores
                        │
                        ▼
              SecurityAlert.svelte — floating toast in bottom-right
```

### Event flow

```
npm install  →  package-lock.json changes
                        │ (800 ms debounce)
                        ▼
              Rust watcher fires → run_full_audit()
                        │
                        ▼
              security-audit-result event emitted
                        │
                        ▼
              SecurityAlert re-renders with new results
```

### SecurityAlert component

The floating alert (`src/lib/components/SecurityAlert.svelte`) shows:

- **Ecosystem badges** — one badge per detected ecosystem with vuln count.
- **Severity summary** — critical + high counts in the header.
- **Expandable list** — vulnerabilities grouped by ecosystem with advisory ID.
- **Missing tool warning** — if a tool (e.g., `cargo-audit`) is not installed.
- **Re-scan button** — triggers a manual audit without reinstalling.
- **Dismiss** — hides the alert until the next audit result arrives.

### Severity levels

| Level | Triggers `has_issues` | Color |
|-------|----------------------|-------|
| critical | ✅ | Red |
| high | ✅ | Orange |
| moderate | ❌ | Amber |
| low | ❌ | Yellow |
| info | ❌ | Sky blue |

Only **critical** and **high** set `has_issues = true` and force the alert to re-appear after dismissal.

---

## Installing Audit Tools

For the in-editor scanning to work, the relevant tools must be installed on the developer's machine:

```bash
# Rust
cargo install cargo-audit --locked

# Python
pip install pip-audit

# Go
go install golang.org/x/vuln/cmd/govulncheck@latest

# Ruby
gem install bundler-audit

# npm / yarn / pnpm — already available if Node.js is installed
```

Tools that are not installed show a **"missing tool"** badge in the SecurityAlert instead of silently failing.

---

## Data Structures

### `AuditReport` (Rust → TypeScript)

```typescript
interface AuditReport {
  project_path: string;
  ecosystems: EcosystemReport[]; // one per detected lockfile
  total_counts: SeverityCounts;  // aggregated across all ecosystems
  has_issues: boolean;           // true if critical > 0 || high > 0
  error: string | null;          // top-level error (e.g. project not found)
}

interface EcosystemReport {
  ecosystem: string;        // "npm" | "cargo" | "python" | "go" | "ruby" | ...
  lockfile: string;         // e.g. "package-lock.json"
  counts: SeverityCounts;
  vulnerabilities: VulnEntry[];
  tool_missing: boolean;    // true if the audit tool is not installed
  error: string | null;
}

interface VulnEntry {
  name: string;
  severity: string;         // "critical" | "high" | "moderate" | "low" | "info"
  range: string;            // affected version range
  fix_available: boolean;
  advisory_id: string | null; // CVE / RUSTSEC / GHSA / etc.
}
```

---

## Adding a New Ecosystem

1. **Add detection** in `detect_ecosystems()` (`src-tauri/src/commands/security.rs`):
   ```rust
   ("composer.lock", Ecosystem::Php),
   ```
2. **Add the runner** `run_php()` and **parser** `parse_composer_audit_json()`.
3. **Add tests** in the `#[cfg(test)]` module.
4. **Add a scan job** in `.github/workflows/security.yml`.
5. **Add the emoji icon** in `SecurityAlert.svelte`:
   ```typescript
   const ECOSYSTEM_ICON = { ..., php: '🐘' };
   ```
