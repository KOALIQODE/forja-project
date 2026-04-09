import { writable } from 'svelte/store';

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_ignored: boolean;
  extension?: string;
  git_status?: 'modified' | 'added' | 'renamed' | 'deleted' | 'untracked';
}

const PINNED_PATH_KEY = "forja-explorer-pinned-path";

/**
 * Store para mantener el estado de expansión de las carpetas.
 */
function createExpandedStore() {
  const { subscribe, update } = writable<Set<string>>(new Set());
  return {
    subscribe,
    toggle: (path: string) => update(set => {
      const newSet = new Set(set);
      if (newSet.has(path)) newSet.delete(path);
      else newSet.add(path);
      return newSet;
    }),
    clear: () => update(() => new Set())
  };
}

/**
 * Store para el camino anclado (Focus Mode).
 */
function createPinnedStore() {
  const initial = typeof localStorage !== 'undefined' ? localStorage.getItem(PINNED_PATH_KEY) : null;
  const { subscribe, set } = writable<string | null>(initial);

  return {
    subscribe,
    pin: (path: string) => {
      localStorage.setItem(PINNED_PATH_KEY, path);
      set(path);
    },
    unpin: () => {
      localStorage.removeItem(PINNED_PATH_KEY);
      set(null);
    }
  };
}

/**
 * Store de Caché para el contenido de los directorios.
 */
function createDirectoryCache() {
  const { subscribe, update } = writable<Map<string, FileEntry[]>>(new Map());
  return {
    subscribe,
    set: (path: string, entries: FileEntry[]) => update(map => {
      const newMap = new Map(map);
      newMap.set(path, entries);
      return newMap;
    }),
    get: (path: string) => {
      let current: Map<string, FileEntry[]> = new Map();
      subscribe(v => current = v)();
      return current.get(path);
    },
    clear: () => update(() => new Map())
  };
}

export const expandedPaths = createExpandedStore();
export const directoryCache = createDirectoryCache();
export const pinnedPath = createPinnedStore();
