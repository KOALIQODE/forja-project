import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: { subscribe: (fn: any) => { fn({ vars: {} }); return () => {}; } },
}));
vi.mock('$lib/stores/bufferStore', () => ({
  activeBufferId: { subscribe: (fn: (value: string | null) => void) => { fn(null); return () => {}; } },
}));
vi.mock('$lib/stores/explorerStore', () => ({
  expandedPaths: {
    subscribe: (fn: (value: Set<string>) => void) => { fn(new Set()); return () => {}; },
    has: () => false,
  },
  inlineAction: {
    subscribe: (fn: (value: null) => void) => { fn(null); return () => {}; },
    clear: vi.fn(),
  },
}));

import FileDrillItem from '$lib/components/explorer/FileDrillItem.svelte';

describe('FileDrillItem', () => {
  const handleEntryClick = vi.fn().mockResolvedValue(undefined);
  const pinFolder = vi.fn();

  it('renders a file entry name without crashing', () => {
    render(FileDrillItem, {
      entry: { name: 'App.svelte', path: '/project/src/App.svelte', is_dir: false, is_ignored: false, extension: '.svelte' },
      handleEntryClick,
      pinFolder,
    });

    expect(screen.getByText('App.svelte')).toBeInTheDocument();
  });

  it('renders a folder entry name', () => {
    render(FileDrillItem, {
      entry: { name: 'src', path: '/project/src', is_dir: true, is_ignored: false },
      handleEntryClick,
      pinFolder,
    });

    expect(screen.getByText('src')).toBeInTheDocument();
  });

  it('shows a git status badge when git_status is set', () => {
    render(FileDrillItem, {
      entry: { name: 'main.ts', path: '/project/src/main.ts', is_dir: false, is_ignored: false, extension: '.ts', git_status: 'modified' },
      handleEntryClick,
      pinFolder,
    });

    expect(screen.getByText('M')).toBeInTheDocument();
  });
});
