import { writable, derived } from 'svelte/store';

export interface Buffer {
  id: string;
  path: string;
  content: string[];
  language?: string;
  lastModified?: number;
}

// All open buffers
export const openBuffers = writable<Map<string, Buffer>>(new Map());

// Currently active buffer ID
export const activeBufferId = writable<string | null>(null);

// Derived store for the current active buffer object
export const activeBuffer = derived(
  [openBuffers, activeBufferId],
  ([$openBuffers, $activeBufferId]) => {
    if (!$activeBufferId) return null;
    return $openBuffers.get($activeBufferId) || null;
  }
);

/**
 * Open a file as a buffer
 */
export function openBuffer(path: string, content: string) {
  const lines = content.split('\n');
  const buffer: Buffer = {
    id: path,
    path,
    content: lines,
    lastModified: Date.now()
  };

  openBuffers.update(map => {
    map.set(path, buffer);
    return map;
  });

  activeBufferId.set(path);
}

/**
 * Close a buffer
 */
export function closeBuffer(id: string) {
  openBuffers.update(map => {
    map.delete(id);
    return map;
  });

  activeBufferId.update(current => {
    if (current === id) {
      // Find another buffer to activate or set to null
      const map = getOpenBuffersMap();
      const keys = Array.from(map.keys());
      return keys.length > 0 ? keys[keys.length - 1] : null;
    }
    return current;
  });
}

// Helper to get raw map value (avoiding circular sub in some cases)
function getOpenBuffersMap(): Map<string, Buffer> {
  let map: Map<string, Buffer> = new Map();
  openBuffers.subscribe(v => map = v)();
  return map;
}
