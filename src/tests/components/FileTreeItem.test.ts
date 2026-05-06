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
    setExpanded: vi.fn(),
  },
  pinnedPath: {
    subscribe: (fn: (value: string | null) => void) => { fn(null); return () => {}; },
    pin: vi.fn(),
  },
  directoryCache: {
    subscribe: (fn: (value: Map<string, unknown>) => void) => { fn(new Map()); return () => {}; },
    set: vi.fn(),
  },
  inlineAction: {
    subscribe: (fn: (value: null) => void) => { fn(null); return () => {}; },
    clear: vi.fn(),
  },
}));

import FileTreeItem from '$lib/components/explorer/FileTreeItem.svelte';

describe('FileTreeItem', () => {
  const handleEntryClick = vi.fn().mockResolvedValue(undefined);

  it('renders the entry name', () => {
    render(FileTreeItem, {
      entry: { name: 'routes', path: '/project/src/routes', is_dir: true, is_ignored: false },
      handleEntryClick,
    });

    expect(screen.getByText('routes')).toBeInTheDocument();
  });

  it('shows a chevron for directory entries', () => {
    const { container } = render(FileTreeItem, {
      entry: { name: 'routes', path: '/project/src/routes', is_dir: true, is_ignored: false },
      handleEntryClick,
    });

    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
  });

  it('shows a git status badge in the label when git_status is set', () => {
    render(FileTreeItem, {
      entry: { name: 'main.ts', path: '/project/src/main.ts', is_dir: false, is_ignored: false, extension: '.ts', git_status: 'added' },
      handleEntryClick,
    });

    expect(screen.getByText('A')).toBeInTheDocument();
  });
});
