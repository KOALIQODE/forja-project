import { writable, derived } from 'svelte/store';
import { activeBufferId } from './bufferStore';

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface Diagnostic {
  /** 0-indexed line */
  line: number;
  /** 0-indexed column */
  col: number;
  endLine?: number;
  endCol?: number;
  message: string;
  severity: DiagnosticSeverity;
  /** e.g. "rust-analyzer", "typescript" */
  source?: string;
  code?: string | number;
}

// ── Core store: filePath → Diagnostic[] ──────────────────────────────────────

export const diagnosticsByFile = writable<Map<string, Diagnostic[]>>(new Map());

export function setDiagnostics(filePath: string, diags: Diagnostic[]) {
  diagnosticsByFile.update(map => {
    const next = new Map(map);
    next.set(filePath, diags);
    return next;
  });
}

export function clearDiagnostics(filePath: string) {
  diagnosticsByFile.update(map => {
    const next = new Map(map);
    next.delete(filePath);
    return next;
  });
}

export function clearAllDiagnostics() {
  diagnosticsByFile.set(new Map());
}

// ── Derived: active buffer diagnostics ───────────────────────────────────────

export const activeDiagnostics = derived(
  [diagnosticsByFile, activeBufferId],
  ([$map, $activeId]) => ($activeId ? ($map.get($activeId) ?? []) : [])
);

export const errorCount = derived(
  activeDiagnostics,
  $d => $d.filter(d => d.severity === 'error').length
);

export const warningCount = derived(
  activeDiagnostics,
  $d => $d.filter(d => d.severity === 'warning').length
);
