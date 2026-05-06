import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const mockInvoke = vi.hoisted(() => vi.fn());
const mockListen = vi.hoisted(() => vi.fn().mockResolvedValue(() => {}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mockListen }));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: { subscribe: (fn: any) => { fn({ vars: {} }); return () => {}; } },
}));

import ParserManager from '$lib/components/ParserManager.svelte';

const parsers = [
  { name: 'tree-sitter-rust', language: 'rust', version: '0.1.0', source_url: 'https://example.test', installed: false },
  { name: 'tree-sitter-svelte', language: 'svelte', version: '0.2.0', source_url: 'https://example.test', installed: true },
];

describe('ParserManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'pm_list_parsers') return parsers;
      return null;
    });
  });

  it('renders parser manager content after loading parsers', async () => {
    render(ParserManager);

    expect(screen.getByText('Parser Manager')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('rust')).toBeInTheDocument();
      expect(screen.getByText('svelte')).toBeInTheDocument();
    });
  });

  it('shows installed state for installed parsers', async () => {
    render(ParserManager);

    await waitFor(() => {
      expect(screen.getByText('✓ Installed')).toBeInTheDocument();
    });
  });

  it('calls pm_download_or_compile_parser when install is clicked', async () => {
    render(ParserManager);

    await waitFor(() => screen.getByRole('button', { name: 'Install' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('pm_download_or_compile_parser', { parserName: 'rust' });
    });
  });
});
