import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const mockInvoke = vi.hoisted(() => vi.fn());
const activeBufferStore = vi.hoisted(() => {
  type Buffer = { id: string; filePath: string; language?: string } | null;
  type Sub = (value: Buffer) => void;
  let value: Buffer = null;
  const subs = new Set<Sub>();
  return {
    subscribe(fn: Sub) { fn(value); subs.add(fn); return () => subs.delete(fn); },
    set(next: Buffer) { value = next; subs.forEach((fn) => fn(value)); },
  };
});

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: { subscribe: (fn: any) => { fn({ vars: {} }); return () => {}; } },
}));
vi.mock('$lib/stores/bufferStore', () => ({
  activeBuffer: activeBufferStore,
}));

import ParserPrompt from '$lib/components/ParserPrompt.svelte';

describe('ParserPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeBufferStore.set({ id: '1', filePath: '/project/src/main.ts', language: 'typescript' });
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'pm_list_parsers') return [{ language: 'typescript', installed: false }];
      if (command === 'pm_download_or_compile_parser') return null;
      return null;
    });
  });

  it('shows a parser recommendation toast when the active buffer language is missing', async () => {
    render(ParserPrompt);

    await waitFor(() => {
      expect(screen.getByText('Enhance Editor')).toBeInTheDocument();
      expect(screen.getByText(/typescript/i)).toBeInTheDocument();
    });
  });

  it('can dismiss the toast with the X button', async () => {
    render(ParserPrompt);

    await waitFor(() => expect(screen.getByText('Enhance Editor')).toBeInTheDocument());
    await fireEvent.click(screen.getAllByRole('button')[0]);

    expect(screen.queryByText('Enhance Editor')).not.toBeInTheDocument();
  });

  it('calls invoke to install the parser when Install Now is clicked', async () => {
    render(ParserPrompt);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Install Now' })).toBeInTheDocument());
    await fireEvent.click(screen.getByRole('button', { name: 'Install Now' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('pm_download_or_compile_parser', { parserName: 'typescript' });
    });
  });
});
