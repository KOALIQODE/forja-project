import { describe, it, expect } from 'vitest';
import { buildDiagByLine } from '$lib/utils/diagnosticsUtils';
import type { Diagnostic } from '$lib/stores/diagnosticsStore';

function makeDiag(line: number, severity: string, message = 'test'): Diagnostic {
  return { line, severity, message, col: 0 } as unknown as Diagnostic;
}

describe('buildDiagByLine', () => {
  it('returns empty map for empty diagnostics array', () => {
    const result = buildDiagByLine([]);
    expect(result.size).toBe(0);
  });

  it('maps a single diagnostic to its line', () => {
    const diag = makeDiag(5, 'error');
    const result = buildDiagByLine([diag]);
    expect(result.size).toBe(1);
    expect(result.get(5)).toBe(diag);
  });

  it('keeps one diagnostic per line when all on different lines', () => {
    const diags = [
      makeDiag(0, 'error'),
      makeDiag(3, 'warning'),
      makeDiag(7, 'info'),
    ];
    const result = buildDiagByLine(diags);
    expect(result.size).toBe(3);
    expect(result.get(0)?.severity).toBe('error');
    expect(result.get(3)?.severity).toBe('warning');
    expect(result.get(7)?.severity).toBe('info');
  });

  it('error beats warning on the same line', () => {
    const warning = makeDiag(2, 'warning', 'warn msg');
    const error   = makeDiag(2, 'error',   'err msg');
    const result  = buildDiagByLine([warning, error]);
    expect(result.get(2)?.severity).toBe('error');
    expect(result.get(2)?.message).toBe('err msg');
  });

  it('warning beats info on the same line', () => {
    const info    = makeDiag(4, 'info',    'info msg');
    const warning = makeDiag(4, 'warning', 'warn msg');
    const result  = buildDiagByLine([info, warning]);
    expect(result.get(4)?.severity).toBe('warning');
  });

  it('error beats hint on the same line', () => {
    const hint  = makeDiag(1, 'hint');
    const error = makeDiag(1, 'error');
    const result = buildDiagByLine([hint, error]);
    expect(result.get(1)?.severity).toBe('error');
  });

  it('keeps the first error when two errors are on the same line', () => {
    const first  = makeDiag(0, 'error', 'first');
    const second = makeDiag(0, 'error', 'second');
    const result = buildDiagByLine([first, second]);
    // same severity — first wins (existing stays)
    expect(result.get(0)?.message).toBe('first');
  });

  it('handles multiple lines each with competing severities', () => {
    const diags = [
      makeDiag(0, 'info'),
      makeDiag(0, 'error'),
      makeDiag(1, 'hint'),
      makeDiag(1, 'warning'),
      makeDiag(2, 'error'),
    ];
    const result = buildDiagByLine(diags);
    expect(result.get(0)?.severity).toBe('error');
    expect(result.get(1)?.severity).toBe('warning');
    expect(result.get(2)?.severity).toBe('error');
  });
});
