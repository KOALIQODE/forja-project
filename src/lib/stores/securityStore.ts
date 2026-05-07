import { derived, writable } from 'svelte/store';
import { activeProjectRoot, scanResults, type ScanResult, type Dependency } from '$lib/DepsStore';

// ── Types (legacy support for SecurityAlert and Tests) ─────────────────────────

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
  severity: string;
  range?: string;
  fix_available: boolean;
  advisory_id: string | null;
  id?: string;
  title?: string;
  description?: string;
  url?: string;
  patched_versions?: string;
}

export interface EcosystemReport {
  ecosystem: string;
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

// ── Derived stores for SecurityAlert.svelte ──────────────────────────────────

const legacyAuditReport = writable<AuditReport | null>(null);

const computedAuditReport = derived([scanResults, activeProjectRoot], ([$results, $activeProjectRoot]) => {
  if (!$results || $results.length === 0) return null;

  const total_counts: SeverityCounts = {
    info: 0,
    low: $results.reduce((acc, r) => acc + r.summary.low, 0),
    moderate: $results.reduce((acc, r) => acc + r.summary.moderate, 0),
    high: $results.reduce((acc, r) => acc + r.summary.high, 0),
    critical: $results.reduce((acc, r) => acc + r.summary.critical, 0),
    total: $results.reduce((acc, r) => acc + r.summary.vulnerable, 0),
  };

  const report: AuditReport = {
    project_path: $activeProjectRoot ?? 'workspace',
    ecosystems: $results.map(r => ({
      ecosystem: r.ecosystem,
      lockfile: r.manifest_path.split('/').pop() || 'manifest',
      counts: {
        critical: r.summary.critical,
        high: r.summary.high,
        moderate: r.summary.moderate,
        low: r.summary.low,
        info: 0,
        total: r.summary.vulnerable
      },
      vulnerabilities: r.dependencies.flatMap(d => d.vulnerabilities.map(v => ({
        ...v,
        name: d.name,
        severity: v.severity.toLowerCase(),
        fix_available: !!v.patched_versions,
        advisory_id: v.id
      }))),
      tool_missing: false,
      error: r.errors.length > 0 ? r.errors.join('; ') : null
    })),
    total_counts,
    has_issues: total_counts.critical > 0 || total_counts.high > 0,
    error: null
  };

  return report;
});

export const auditReport = derived(
  [computedAuditReport, legacyAuditReport],
  ([$computedAuditReport, $legacyAuditReport]) => $legacyAuditReport ?? $computedAuditReport
);

export const hasSecurityIssues = derived(auditReport, ($r) => $r?.has_issues ?? false);

export const criticalCount = derived(auditReport, ($r) => $r?.total_counts.critical ?? 0);

export const highCount = derived(auditReport, ($r) => $r?.total_counts.high ?? 0);

export const totalVulnCount = derived(auditReport, ($r) => $r?.total_counts.total ?? 0);

export const affectedEcosystems = derived(auditReport, ($r) =>
  $r?.ecosystems.filter((e) => e.counts.total > 0 || e.tool_missing || e.error !== null) ?? []
);

export const scannedEcosystems = derived(auditReport, ($r) =>
  $r?.ecosystems.filter((e) => !e.tool_missing && e.error === null) ?? []
);

export const nestedReports = derived(scanResults, ($results: ScanResult[]): AuditReport[] => {
    // Return individual reports per project path for the "Projects scanned" list
    return $results.map((r: ScanResult) => ({
        project_path: r.manifest_path,
        total_counts: {
            total: r.summary.vulnerable,
            critical: r.summary.critical,
            high: r.summary.high,
            moderate: r.summary.moderate,
            low: r.summary.low,
            info: 0
        },
        has_issues: r.summary.critical > 0 || r.summary.high > 0,
        error: null,
        ecosystems: [{
            ecosystem: r.ecosystem,
            lockfile: r.manifest_path.split('/').pop() || 'manifest',
            counts: {
                total: r.summary.vulnerable,
                critical: r.summary.critical,
                high: r.summary.high,
                moderate: r.summary.moderate,
                low: r.summary.low,
                info: 0
            },
            vulnerabilities: r.dependencies.flatMap((d: Dependency) => d.vulnerabilities.map((v) => ({
                ...v,
                name: d.name,
                severity: v.severity.toLowerCase(),
                fix_available: !!v.patched_versions,
                advisory_id: v.id
            }))),
            tool_missing: false,
            error: null
        }]
    }));
});

export function clearAuditReport() {
  legacyAuditReport.set(null);
  scanResults.set([]);
}

/** Legacy setAuditReport to support existing tests */
export function setAuditReport(report: any) {
    legacyAuditReport.set(report ?? null);
}
