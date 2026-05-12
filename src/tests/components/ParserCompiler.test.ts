import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const mockInvoke = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockListen = vi.hoisted(() => vi.fn().mockResolvedValue(() => {}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mockListen }));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: { subscribe: (fn: any) => { fn({ vars: {} }); return () => {}; } },
}));

import ParserCompiler from '$lib/components/ParserCompiler.svelte';

describe('ParserCompiler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(null);
    mockListen.mockResolvedValue(() => {});
  });

  it('renders the parser name and idle compile button initially', () => {
    render(ParserCompiler, { parserName: 'typescript' });

    expect(screen.getByText('typescript')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compile' })).toBeInTheDocument();
    expect(screen.queryByText('Downloading source...')).not.toBeInTheDocument();
  });

  it('calls pm_download_or_compile_parser with the parserName when compile is clicked', async () => {
    render(ParserCompiler, { parserName: 'rust' });

    await fireEvent.click(screen.getByRole('button', { name: 'Compile' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('pm_download_or_compile_parser', { parserName: 'rust' });
    });
  });

  it('shows progress state after compile starts', async () => {
    render(ParserCompiler, { parserName: 'lua' });

    await fireEvent.click(screen.getByRole('button', { name: 'Compile' }));

    expect(screen.getByText('Downloading source...')).toBeInTheDocument();
  });
});
