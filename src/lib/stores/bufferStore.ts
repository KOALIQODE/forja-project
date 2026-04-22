import { writable, derived } from 'svelte/store';

// Simple extname implementation for browser
function extname(path: string): string {
  const base = path.split(/[\/\\]/).pop() || '';
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
const SAVED_BUFFERS_KEY = "forja-open-buffers";
const ACTIVE_BUFFER_KEY = "forja-active-buffer";

function loadSavedBuffers(): Map<string, Buffer> {
  if (typeof localStorage === 'undefined') return new Map();
  try {
    const saved = localStorage.getItem(SAVED_BUFFERS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return new Map(Object.entries(parsed));
    }
  } catch (e) {
    console.error("Failed to load buffers:", e);
  }
  return new Map();
}

export const openBuffers = writable<Map<string, Buffer>>(loadSavedBuffers());

// Currently active buffer ID
export const activeBufferId = writable<string | null>(
  typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_BUFFER_KEY) : null
);

// Persist changes
if (typeof localStorage !== 'undefined') {
  openBuffers.subscribe(map => {
    const obj = Object.fromEntries(map.entries());
    localStorage.setItem(SAVED_BUFFERS_KEY, JSON.stringify(obj));
  });
  activeBufferId.subscribe(id => {
    if (id) localStorage.setItem(ACTIVE_BUFFER_KEY, id);
    else localStorage.removeItem(ACTIVE_BUFFER_KEY);
  });
}

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