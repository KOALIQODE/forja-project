import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import { STORAGE_KEYS } from '$lib/utils/constants';

async function loadExplorerStore() {
  return import('$lib/stores/explorerStore');
}

const entries = [
  {
    name: 'src',
    path: '/project/src',
    is_dir: true,
    is_ignored: false,
    depth: 1,
  },
  {
    name: 'App.svelte',
    path: '/project/src/App.svelte',
    is_dir: false,
    is_ignored: false,
    extension: '.svelte',
    git_status: 'modified' as const,
    depth: 2,
  },
];

describe('explorerStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('expandedPaths starts empty and toggle adds/removes entries', async () => {
    const { expandedPaths } = await loadExplorerStore();

    expect(get(expandedPaths)).toEqual(new Set());

    expandedPaths.toggle('/project/src');
    expect(get(expandedPaths)).toEqual(new Set(['/project/src']));

    expandedPaths.toggle('/project/src');
    expect(get(expandedPaths)).toEqual(new Set());
  });

  it('expandedPaths.setExpanded adds and removes a path explicitly', async () => {
    const { expandedPaths } = await loadExplorerStore();

    expandedPaths.setExpanded('/project/src', true);
    expect(get(expandedPaths).has('/project/src')).toBe(true);

    expandedPaths.setExpanded('/project/src', false);
    expect(get(expandedPaths).has('/project/src')).toBe(false);
  });

  it('expandedPaths.clear removes all expanded entries', async () => {
    const { expandedPaths } = await loadExplorerStore();

    expandedPaths.toggle('/project/src');
    expandedPaths.toggle('/project/docs');
    expandedPaths.clear();

    expect(get(expandedPaths).size).toBe(0);
  });

  it('pinnedPath reads its initial value from localStorage', async () => {
    localStorage.setItem(STORAGE_KEYS.EXPLORER_PINNED_PATH, '/project/src');

    const { pinnedPath } = await loadExplorerStore();

    expect(get(pinnedPath)).toBe('/project/src');
  });

  it('pinnedPath.pin stores the path in the store and localStorage', async () => {
    const { pinnedPath } = await loadExplorerStore();

    pinnedPath.pin('/project/src');

    expect(get(pinnedPath)).toBe('/project/src');
    expect(localStorage.getItem(STORAGE_KEYS.EXPLORER_PINNED_PATH)).toBe('/project/src');
  });

  it('pinnedPath.unpin clears the store and localStorage', async () => {
    const { pinnedPath } = await loadExplorerStore();

    pinnedPath.pin('/project/src');
    pinnedPath.unpin();

    expect(get(pinnedPath)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.EXPLORER_PINNED_PATH)).toBeNull();
  });

  it('directoryCache starts empty and stores entries by path', async () => {
    const { directoryCache } = await loadExplorerStore();

    expect(get(directoryCache)).toEqual(new Map());

    directoryCache.set('/project', entries);

    expect(directoryCache.get('/project')).toEqual(entries);
    expect(get(directoryCache).get('/project')).toEqual(entries);
  });

  it('directoryCache.clear empties the cache', async () => {
    const { directoryCache } = await loadExplorerStore();

    directoryCache.set('/project', entries);
    directoryCache.clear();

    expect(get(directoryCache).size).toBe(0);
  });

  it('inlineAction starts null and can be set and cleared', async () => {
    const { inlineAction } = await loadExplorerStore();

    expect(get(inlineAction)).toBeNull();

    inlineAction.setAction('rename', '/project/src/App.svelte');
    expect(get(inlineAction)).toEqual({ type: 'rename', path: '/project/src/App.svelte' });

    inlineAction.clear();
    expect(get(inlineAction)).toBeNull();
  });
});
