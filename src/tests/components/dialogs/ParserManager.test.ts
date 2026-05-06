import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const mockInvoke = vi.hoisted(() => vi.fn());
const mockCloseDialog = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: { subscribe: (fn: any) => { fn({ vars: {} }); return () => {}; } },
}));
vi.mock('$lib/stores/dialogStore', () => ({
  closeDialog: mockCloseDialog,
}));

import ParserManagerDialog from '$lib/components/dialogs/ParserManager.svelte';

const parsers = [
  { name: 'tree-sitter-svelte', language: 'svelte', version: '0.1.0', installed: true, source_url: 'https://example.test' },
  { name: 'tree-sitter-rust', language: 'rust', version: '0.2.0', installed: false, source_url: 'https://example.test' },
];

describe('dialogs/ParserManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'pm_list_parsers') return parsers;
      return null;
    });
  });

  it('renders the grammar hub and parser rows', async () => {
    render(ParserManagerDialog);

    expect(screen.getByText('GRAMMAR HUB')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('svelte')).toBeInTheDocument();
      expect(screen.getByText('rust')).toBeInTheDocument();
    });
  });

  it('filters parsers with the search input', async () => {
    render(ParserManagerDialog);

    await waitFor(() => screen.getByDisplayValue(''));
    const input = screen.getByPlaceholderText('Search languages…');
    await fireEvent.input(input, { target: { value: 'rust' } });

    expect(screen.getByText('rust')).toBeInTheDocument();
    expect(screen.queryByText('svelte')).not.toBeInTheDocument();
  });

  it('shows the empty search state when nothing matches', async () => {
    render(ParserManagerDialog);

    const input = await screen.findByPlaceholderText('Search languages…');
    await fireEvent.input(input, { target: { value: 'python' } });

    expect(screen.getByText('No parsers match')).toBeInTheDocument();
  });
});
