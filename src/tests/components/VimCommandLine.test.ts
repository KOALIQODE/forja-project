import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: {
    subscribe(fn: (value: { vars: Record<string, string> }) => void) {
      fn({ vars: {} });
      return () => {};
    },
  },
}));

import VimCommandLine from '$lib/components/editor/VimCommandLine.svelte';

describe('VimCommandLine', () => {
  it('renders the vim command line container', () => {
    render(VimCommandLine, { commandLine: 'w' });

    expect(screen.getByTestId('vim-command-line')).toBeInTheDocument();
  });

  it('displays the provided commandLine text', () => {
    render(VimCommandLine, { commandLine: 'write' });

    expect(screen.getByText('write')).toBeInTheDocument();
  });

  it('shows the colon prefix for command mode', () => {
    render(VimCommandLine, { commandLine: 'q' });

    expect(screen.getByText(':')).toBeInTheDocument();
  });
});
