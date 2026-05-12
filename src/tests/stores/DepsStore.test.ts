import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const mockInvoke = vi.hoisted(() => vi.fn());
const mockListen = vi.hoisted(() => vi.fn().mockResolvedValue(() => {}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mockListen }));

import {
  activeProjectRoot,
  clearDepsState,
  hasDetectedManifests,
  scanAll,
  scanResults,
  selectManifest,
  selectedManifest,
  selectedManifestPath,
  syncProjectDependencies,
  validatableEcosystems,
  watcherActive,
  type ScanResult,
} from '$lib/DepsStore';

function makeResult(overrides: Partial<ScanResult>): ScanResult {
  return {
    manifest_path: '/project/package.json',
    ecosystem: 'npm',
    language: 'JavaScript / TypeScript',
    dependencies: [],
    summary: {
      total: 0,
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      outdated: 0,
      vulnerable: 0,
    },
    scanned_at: '2026-05-06T00:00:00Z',
    errors: [],
    ...overrides,
  };
}

describe('DepsStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    mockInvoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'scan_all') {
        if (args?.root === '/project-a') {
          return [
            makeResult({
              manifest_path: '/project-a/package.json',
              ecosystem: 'npm',
            }),
          ];
        }

        if (args?.root === '/project-b') {
          return [];
        }

        return [
          makeResult({
            manifest_path: '/project-a/src-tauri/Cargo.toml',
            ecosystem: 'cargo',
            language: 'Rust',
          }),
          makeResult({
            manifest_path: '/project-a/package.json',
            ecosystem: 'npm',
          }),
        ];
      }

      if (command === 'scan_manifest') {
        return makeResult({
          manifest_path: String(args?.manifestPath ?? '/project-a/package.json'),
        });
      }

      return undefined;
    });

    await clearDepsState();
  });

  it('replaces stale results when the active project changes', async () => {
    await syncProjectDependencies('/project-a');

    expect(get(activeProjectRoot)).toBe('/project-a');
    expect(get(scanResults)).toHaveLength(1);
    expect(get(validatableEcosystems)).toEqual(['npm']);
    expect(get(watcherActive)).toBe(true);

    await syncProjectDependencies('/project-b');

    expect(get(activeProjectRoot)).toBe('/project-b');
    expect(get(scanResults)).toEqual([]);
    expect(get(hasDetectedManifests)).toBe(false);
    expect(get(validatableEcosystems)).toEqual([]);
    expect(get(selectedManifest)).toBeNull();
  });

  it('keeps a selected manifest tied to the current scan results', async () => {
    await scanAll('/workspace');

    expect(get(selectedManifestPath)).toBe('/project-a/package.json');

    selectManifest('/project-a/src-tauri/Cargo.toml');

    expect(get(selectedManifest)?.ecosystem).toBe('cargo');
  });
});
