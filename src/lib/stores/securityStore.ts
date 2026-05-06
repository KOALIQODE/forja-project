import { writable, derived } from 'svelte/store';

// ── Types (mirror Rust DTOs) ──────────────────────────────────────────────────

export interface SeverityCounts {
  info: number;
  low: number;
  moderate: number;
  high: number;
  critical: number;
  total: number;
}

export interface VulnEntry {
  name: string;
  severity: 'critical' | 'high' | 'moderate' | 'medium' | 'low' | 'info' | string;
  range: string;
  fix_available: boolean;
  advisory_id: string | null;
}

export interface EcosystemReport {
  ecosystem: string; // "npm" | "cargo" | "python" | "go" | "ruby" | "yarn" | "pnpm"
  lockfile: string;
  counts: SeverityCounts;
  vulnerabilities: VulnEntry[];
  tool_missing: boolean;
  error: string | null;
}

export interface AuditReport {
  project_path: string;
  ecosystems: EcosystemReport[];
  total_counts: SeverityCounts;
  has_issues: boolean;
  error: string | null;
}

// ── Core store ────────────────────────────────────────────────────────────────

export const nestedReports = writable<AuditReport[]>([]);

// auditReport remains the aggregated view used by the UI (backwards compatible)
export const auditReport = writable<AuditReport | null>(null);

function emptyCounts(): SeverityCounts {
  return { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
}

function aggregateReports(reports: AuditReport[]): AuditReport | null {
  if (!reports || reports.length === 0) return null;
  const aggregated: AuditReport = {
    project_path: 'workspace',
    ecosystems: [],
    total_counts: emptyCounts(),
    has_issues: false,
    error: null,
  };

  for (const r of reports) {
    // prefix ecosystem lockfile paths with project path to keep them unique
    const prefixedEcosystems = r.ecosystems.map((e) => ({
      ...e,
      lockfile: r.project_path && r.project_path !== '.' ? `${r.project_path}/${e.lockfile}` : e.lockfile,
    }));

    aggregated.ecosystems.push(...prefixedEcosystems);

    // sum counts
    if (r.total_counts) {
      aggregated.total_counts.critical += r.total_counts.critical || 0;
      aggregated.total_counts.high += r.total_counts.high || 0;
      aggregated.total_counts.moderate += r.total_counts.moderate || 0;
      aggregated.total_counts.low += r.total_counts.low || 0;
      aggregated.total_counts.info += r.total_counts.info || 0;
      aggregated.total_counts.total += r.total_counts.total || 0;
    }

    if (r.has_issues) aggregated.has_issues = true;
    if (r.error) {
      aggregated.error = aggregated.error ? `${aggregated.error}; ${r.error}` : r.error;
    }
  }

  return aggregated;
}

export function setAuditReport(report: AuditReport | AuditReport[]) {
  if (Array.isArray(report)) {
    nestedReports.set(report);
    auditReport.set(aggregateReports(report));
  } else {
    // single report -> set nestedReports to single entry and use the report as-is
    nestedReports.set([report]);
    auditReport.set(report);
  }
}

/** Add or update a nested audit report (useful for real-time updates per-subproject). */
export function upsertNestedReport(report: AuditReport) {
  nestedReports.update((list) => {
    const idx = list.findIndex((r) => r.project_path === report.project_path);
    if (idx >= 0) list[idx] = report;
    else list.push(report);
    // update aggregated view
    auditReport.set(aggregateReports(list));
    return list;
  });
}

/** Remove a nested report by project path (e.g., when a subproject is closed). */
export function removeNestedReport(projectPath: string) {
  nestedReports.update((list) => {
    const out = list.filter((r) => r.project_path !== projectPath);
    auditReport.set(aggregateReports(out));
    return out;
  });
}

export function clearAuditReport() {
  nestedReports.set([]);
  auditReport.set(null);
}

// ── Derived helpers ───────────────────────────────────────────────────────────

export const hasSecurityIssues = derived(auditReport, ($r) => $r?.has_issues ?? false);

export const criticalCount = derived(auditReport, ($r) => $r?.total_counts.critical ?? 0);

export const highCount = derived(auditReport, ($r) => $r?.total_counts.high ?? 0);

export const totalVulnCount = derived(auditReport, ($r) => $r?.total_counts.total ?? 0);

/** Ecosystems with at least one vulnerability (or a tool-missing/error state). */
export const affectedEcosystems = derived(auditReport, ($r) =>
  $r?.ecosystems.filter((e) => e.counts.total > 0 || e.tool_missing || e.error !== null) ?? []
);

/** All ecosystems that were scanned successfully (tool present, no error). */
export const scannedEcosystems = derived(auditReport, ($r) =>
  $r?.ecosystems.filter((e) => !e.tool_missing && e.error === null) ?? []
);

// Additionally expose flattened vulns across nested reports
export const allVulnerabilities = derived(nestedReports, ($list) =>
  $list.flatMap((r) =>
    r.ecosystems.flatMap((e) => e.vulnerabilities.map((v) => ({ ...v, ecosystem: e.ecosystem, project_path: r.project_path })))
  )
);
