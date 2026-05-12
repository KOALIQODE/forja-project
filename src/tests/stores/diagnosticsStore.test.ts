import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import { activeBufferId } from '$lib/stores/bufferStore';
import {
  activeDiagnostics,
  clearAllDiagnostics,
  clearDiagnostics,
  diagnosticsByFile,
  errorCount,
  setDiagnostics,
  warningCount,
  type Diagnostic,
} from '$lib/stores/diagnosticsStore';

const fileA = '/workspace/src/App.svelte';
const fileB = '/workspace/src/lib/utils.ts';

const sampleDiagnostics: Diagnostic[] = [
  { line: 0, col: 1, message: 'Missing semicolon', severity: 'warning' },
  { line: 1, col: 4, message: 'Type mismatch', severity: 'error' },
  { line: 2, col: 0, message: 'Unused value', severity: 'error' },
];

describe('diagnosticsStore', () => {
  beforeEach(() => {
    clearAllDiagnostics();
    activeBufferId.set(null);
  });

  it('initializes diagnosticsByFile with an empty Map', () => {
    expect(get(diagnosticsByFile)).toEqual(new Map());
  });

  it('setDiagnostics adds diagnostics for a file', () => {
    setDiagnostics(fileA, sampleDiagnostics);

    expect(get(diagnosticsByFile).get(fileA)).toEqual(sampleDiagnostics);
  });

  it('clearDiagnostics removes diagnostics for a file', () => {
    setDiagnostics(fileA, sampleDiagnostics);
    setDiagnostics(fileB, [{ line: 0, col: 0, message: 'Keep me', severity: 'info' }]);

    clearDiagnostics(fileA);

    expect(get(diagnosticsByFile).has(fileA)).toBe(false);
    expect(get(diagnosticsByFile).get(fileB)).toHaveLength(1);
  });

  it('clearAllDiagnostics empties the diagnostics map', () => {
    setDiagnostics(fileA, sampleDiagnostics);
    setDiagnostics(fileB, [{ line: 0, col: 0, message: 'Other', severity: 'hint' }]);

    clearAllDiagnostics();

    expect(get(diagnosticsByFile).size).toBe(0);
  });

  it('activeDiagnostics is empty when there is no active buffer', () => {
    setDiagnostics(fileA, sampleDiagnostics);

    expect(get(activeDiagnostics)).toEqual([]);
  });

  it('activeDiagnostics returns diagnostics for the active buffer id', () => {
    setDiagnostics(fileA, sampleDiagnostics);
    setDiagnostics(fileB, [{ line: 5, col: 0, message: 'Other file', severity: 'warning' }]);
    activeBufferId.set(fileA);

    expect(get(activeDiagnostics)).toEqual(sampleDiagnostics);
  });

  it('errorCount counts only active diagnostics with error severity', () => {
    setDiagnostics(fileA, sampleDiagnostics);
    activeBufferId.set(fileA);

    expect(get(errorCount)).toBe(2);
  });

  it('warningCount counts only active diagnostics with warning severity', () => {
    setDiagnostics(fileA, sampleDiagnostics);
    activeBufferId.set(fileA);

    expect(get(warningCount)).toBe(1);
  });
});
