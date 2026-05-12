import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import {
  auditReport,
  setAuditReport,
  clearAuditReport,
  hasSecurityIssues,
  criticalCount,
  highCount,
  totalVulnCount,
  affectedEcosystems,
  scannedEcosystems,
  type AuditReport,
  type EcosystemReport,
  type SeverityCounts,
} from '$lib/stores/securityStore';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCounts(overrides: Partial<SeverityCounts> = {}): SeverityCounts {
  return { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...overrides };
}

function makeEco(
  ecosystem: string,
  overrides: Partial<EcosystemReport> = {}
): EcosystemReport {
  return {
    ecosystem,
    lockfile: `${ecosystem}-lockfile`,
    counts: makeCounts(),
    vulnerabilities: [],
    tool_missing: false,
    error: null,
    ...overrides,
  };
}

function makeReport(overrides: Partial<AuditReport> = {}): AuditReport {
  return {
    project_path: '/workspace/my-project',
    ecosystems: [],
    total_counts: makeCounts(),
    has_issues: false,
    error: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('securityStore', () => {
  beforeEach(() => clearAuditReport());

  // ── Initial state ──────────────────────────────────────────────────────────

  it('initializes with null', () => {
    expect(get(auditReport)).toBeNull();
  });

  it('hasSecurityIssues is false when store is null', () => {
    expect(get(hasSecurityIssues)).toBe(false);
  });

  it('criticalCount is 0 when store is null', () => {
    expect(get(criticalCount)).toBe(0);
  });

  it('highCount is 0 when store is null', () => {
    expect(get(highCount)).toBe(0);
  });

  it('totalVulnCount is 0 when store is null', () => {
    expect(get(totalVulnCount)).toBe(0);
  });

  it('affectedEcosystems is empty when store is null', () => {
    expect(get(affectedEcosystems)).toEqual([]);
  });

  it('scannedEcosystems is empty when store is null', () => {
    expect(get(scannedEcosystems)).toEqual([]);
  });

  // ── setAuditReport ─────────────────────────────────────────────────────────

  it('setAuditReport updates the store', () => {
    const report = makeReport();
    setAuditReport(report);
    expect(get(auditReport)).toEqual(report);
  });

  it('setAuditReport replaces a previous report', () => {
    setAuditReport(makeReport({ project_path: '/first' }));
    setAuditReport(makeReport({ project_path: '/second' }));
    expect(get(auditReport)?.project_path).toBe('/second');
  });

  // ── clearAuditReport ───────────────────────────────────────────────────────

  it('clearAuditReport resets store to null', () => {
    setAuditReport(makeReport());
    clearAuditReport();
    expect(get(auditReport)).toBeNull();
  });

  // ── hasSecurityIssues ──────────────────────────────────────────────────────

  it('hasSecurityIssues is true when has_issues is true', () => {
    setAuditReport(makeReport({ has_issues: true, total_counts: makeCounts({ high: 1, total: 1 }) }));
    expect(get(hasSecurityIssues)).toBe(true);
  });

  it('hasSecurityIssues is false when has_issues is false', () => {
    setAuditReport(makeReport({ has_issues: false }));
    expect(get(hasSecurityIssues)).toBe(false);
  });

  // ── criticalCount ──────────────────────────────────────────────────────────

  it('criticalCount reflects total_counts.critical', () => {
    setAuditReport(makeReport({ total_counts: makeCounts({ critical: 3, total: 3 }) }));
    expect(get(criticalCount)).toBe(3);
  });

  it('criticalCount is 0 for a clean report', () => {
    setAuditReport(makeReport());
    expect(get(criticalCount)).toBe(0);
  });

  // ── highCount ─────────────────────────────────────────────────────────────

  it('highCount reflects total_counts.high', () => {
    setAuditReport(makeReport({ total_counts: makeCounts({ high: 5, total: 5 }) }));
    expect(get(highCount)).toBe(5);
  });

  // ── totalVulnCount ────────────────────────────────────────────────────────

  it('totalVulnCount reflects total_counts.total across ecosystems', () => {
    setAuditReport(
      makeReport({
        total_counts: makeCounts({ high: 2, moderate: 1, total: 3 }),
      })
    );
    expect(get(totalVulnCount)).toBe(3);
  });

  // ── affectedEcosystems ────────────────────────────────────────────────────

  it('affectedEcosystems includes ecosystems with vulnerabilities', () => {
    const npmEco = makeEco('npm', { counts: makeCounts({ high: 1, total: 1 }) });
    const cargoEco = makeEco('cargo'); // clean
    setAuditReport(makeReport({ ecosystems: [npmEco, cargoEco], has_issues: true }));
    expect(get(affectedEcosystems)).toHaveLength(1);
    expect(get(affectedEcosystems)[0].ecosystem).toBe('npm');
  });

  it('affectedEcosystems includes ecosystems with missing tools', () => {
    const goEco = makeEco('go', { tool_missing: true, error: '`go` audit tool not found.' });
    setAuditReport(makeReport({ ecosystems: [goEco] }));
    expect(get(affectedEcosystems)).toHaveLength(1);
    expect(get(affectedEcosystems)[0].ecosystem).toBe('go');
  });

  it('affectedEcosystems is empty when all ecosystems are clean', () => {
    const npmEco = makeEco('npm');
    const cargoEco = makeEco('cargo');
    setAuditReport(makeReport({ ecosystems: [npmEco, cargoEco] }));
    expect(get(affectedEcosystems)).toHaveLength(0);
  });

  // ── scannedEcosystems ─────────────────────────────────────────────────────

  it('scannedEcosystems excludes tool_missing ecosystems', () => {
    const npmEco = makeEco('npm');
    const goEco = makeEco('go', { tool_missing: true });
    setAuditReport(makeReport({ ecosystems: [npmEco, goEco] }));
    expect(get(scannedEcosystems)).toHaveLength(1);
    expect(get(scannedEcosystems)[0].ecosystem).toBe('npm');
  });

  it('scannedEcosystems excludes ecosystems with errors', () => {
    const npmEco = makeEco('npm');
    const pyEco = makeEco('python', { error: 'pip-audit crashed' });
    setAuditReport(makeReport({ ecosystems: [npmEco, pyEco] }));
    expect(get(scannedEcosystems)).toHaveLength(1);
    expect(get(scannedEcosystems)[0].ecosystem).toBe('npm');
  });

  it('scannedEcosystems includes all ecosystems when all are healthy', () => {
    const ecosystems = ['npm', 'cargo', 'python'].map((e) => makeEco(e));
    setAuditReport(makeReport({ ecosystems }));
    expect(get(scannedEcosystems)).toHaveLength(3);
  });

  // ── multi-ecosystem aggregation ───────────────────────────────────────────

  it('correctly reflects combined vulnerabilities from multiple ecosystems', () => {
    const npmEco = makeEco('npm', {
      counts: makeCounts({ high: 2, total: 2 }),
      vulnerabilities: [
        { name: 'lodash', severity: 'high', range: '<4.17.21', fix_available: true, advisory_id: null },
        { name: 'ansi-html', severity: 'high', range: '*', fix_available: false, advisory_id: 'CVE-2021-23424' },
      ],
    });
    const cargoEco = makeEco('cargo', {
      counts: makeCounts({ critical: 1, total: 1 }),
      vulnerabilities: [
        { name: 'openssl', severity: 'critical', range: '>=1.0.2u', fix_available: true, advisory_id: 'RUSTSEC-2021-0001' },
      ],
    });
    setAuditReport(
      makeReport({
        ecosystems: [npmEco, cargoEco],
        total_counts: makeCounts({ high: 2, critical: 1, total: 3 }),
        has_issues: true,
      })
    );

    expect(get(criticalCount)).toBe(1);
    expect(get(highCount)).toBe(2);
    expect(get(totalVulnCount)).toBe(3);
    expect(get(hasSecurityIssues)).toBe(true);
  });

  it('has_issues is false even with moderate/low vulns only', () => {
    setAuditReport(
      makeReport({
        total_counts: makeCounts({ moderate: 3, low: 1, total: 4 }),
        has_issues: false,
      })
    );
    expect(get(hasSecurityIssues)).toBe(false);
    expect(get(totalVulnCount)).toBe(4);
  });
});
