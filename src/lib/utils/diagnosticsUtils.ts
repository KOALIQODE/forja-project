/**
 * Pure utilities for LSP/diagnostic data.
 * No Svelte state or DOM dependencies — safe to unit-test in isolation.
 */

import type { Diagnostic } from '$lib/stores/diagnosticsStore';

const SEVERITY_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2, hint: 3 };

/**
 * Build a line → most-severe Diagnostic map from a flat diagnostics array.
 * When multiple diagnostics share a line, only the highest-severity one is kept.
 */
export function buildDiagByLine(diagnostics: Diagnostic[]): Map<number, Diagnostic> {
    const map = new Map<number, Diagnostic>();
    for (const d of diagnostics) {
        const existing = map.get(d.line);
        if (!existing || SEVERITY_ORDER[d.severity] < SEVERITY_ORDER[existing.severity]) {
            map.set(d.line, d);
        }
    }
    return map;
}
