import { writable, derived } from 'svelte/store';

// Simple extname implementation for browser
function extname(path: string): string {
  const base = path.split(/[/\\]/).pop() || '';
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex <= 0) return '';
  return base.substring(dotIndex);
}

export interface Buffer {
  id: string; // File path acts as ID
  filePath: string;
  language?: string; // Derived from file extension
  lastModified?: number;
  // content is no longer stored directly in the buffer store
  // It will be fetched on demand by the EditorBuffer component
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
export function openBuffer(filePath: string) {
  console.log("bufferStore: Opening buffer for", filePath);
  // Derive language from file extension
  const extension = extname(filePath).toLowerCase();
  let language: string | undefined;
  switch (extension) {
    case '.rs':
      language = 'rust';
      break;
    case '.js':
    case '.ts':
    case '.svelte':
      language = 'javascript'; // or typescript
      break;
    case '.py':
      language = 'python';
      break;
    case '.json':
      language = 'json';
      break;
    default:
      language = undefined;
  }

  const buffer: Buffer = {
    id: filePath,
    filePath,
    language,
    lastModified: Date.now()
  };

  openBuffers.update(map => {
    const newMap = new Map(map);
    newMap.set(filePath, buffer);
    return newMap;
  });

  activeBufferId.set(filePath);
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