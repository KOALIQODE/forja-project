import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import DependencyValidator from '$lib/components/explorer/DependencyValidator.svelte';
import { clearDepsState, scanResults, type ScanResult } from '$lib/DepsStore';
import { currentProject } from '$lib/stores/projectStore';

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

describe('DependencyValidator', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue([]);
    currentProject.set('/project');
    await clearDepsState();
  });

  it('shows an empty state when the project has no supported manifests', () => {
    render(DependencyValidator);

    expect(
      screen.getByText('No supported dependency manifests were detected in this project.')
    ).toBeInTheDocument();
  });

  it('renders only the validation ecosystems detected for the current project', () => {
    scanResults.set([
      makeResult({
        manifest_path: '/project/src-tauri/Cargo.toml',
        ecosystem: 'cargo',
        language: 'Rust',
      }),
    ]);

    render(DependencyValidator);

    expect(screen.getByRole('button', { name: /Cargo/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /NPM/i })).not.toBeInTheDocument();
  });
});
