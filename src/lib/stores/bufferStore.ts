import { writable, derived, get } from 'svelte/store';
import { currentProject } from './projectStore';

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
}

// Keys for localStorage
const SAVED_BUFFERS_PREFIX = "forja-buffers-";
const ACTIVE_BUFFER_PREFIX = "forja-active-";

export const openBuffers = writable<Map<string, Buffer>>(new Map());
export const activeBufferId = writable<string | null>(null);

// Derived store for the current active buffer object
export const activeBuffer = derived(
  [openBuffers, activeBufferId],
  ([$openBuffers, $activeBufferId]) => {
    if (!$activeBufferId) return null;
    return $openBuffers.get($activeBufferId) || null;
  }
);

// Subscribe to current project to load/save buffers
let currentProjectPath: string | null = null;

currentProject.subscribe(project => {
  if (typeof localStorage === 'undefined') return;
  
  // Save current buffers before switching
  if (currentProjectPath) {
    saveBuffersForProject(currentProjectPath, get(openBuffers), get(activeBufferId));
  }

  currentProjectPath = project;

  if (project) {
    const { buffers, activeId } = loadBuffersForProject(project);
    openBuffers.set(buffers);
    activeBufferId.set(activeId);
  } else {
    openBuffers.set(new Map());
    activeBufferId.set(null);
  }
});

function loadBuffersForProject(project: string): { buffers: Map<string, Buffer>, activeId: string | null } {
  const buffersKey = SAVED_BUFFERS_PREFIX + btoa(project);
  const activeKey = ACTIVE_BUFFER_PREFIX + btoa(project);
  
  let buffers = new Map<string, Buffer>();
  let activeId: string | null = null;

  try {
    const savedBuffers = localStorage.getItem(buffersKey);
    if (savedBuffers) {
      const parsed = JSON.parse(savedBuffers);
      buffers = new Map(Object.entries(parsed));
    }

    activeId = localStorage.getItem(activeKey);
  } catch (e) {
    console.error("Failed to load buffers for project:", project, e);
  }

  return { buffers, activeId };
}

function saveBuffersForProject(project: string, buffers: Map<string, Buffer>, activeId: string | null) {
  const buffersKey = SAVED_BUFFERS_PREFIX + btoa(project);
  const activeKey = ACTIVE_BUFFER_PREFIX + btoa(project);

  try {
    const obj = Object.fromEntries(buffers.entries());
    localStorage.setItem(buffersKey, JSON.stringify(obj));
    if (activeId) {
      localStorage.setItem(activeKey, activeId);
    } else {
      localStorage.removeItem(activeKey);
    }
  } catch (e) {
    console.error("Failed to save buffers for project:", project, e);
  }
}

// Auto-save on buffer changes
openBuffers.subscribe(map => {
  if (currentProjectPath) {
    saveBuffersForProject(currentProjectPath, map, get(activeBufferId));
  }
});

activeBufferId.subscribe(id => {
  if (currentProjectPath) {
    saveBuffersForProject(currentProjectPath, get(openBuffers), id);
  }
});

/**
 * Open a file as a buffer
 */
export function openBuffer(filePath: string) {
  // console.log("bufferStore: Opening buffer for", filePath);
  const extension = extname(filePath).toLowerCase();
  let language: string | undefined;
  
  // Basic language detection
  const langMap: Record<string, string> = {
    '.rs': 'rust',
    '.js': 'javascript',
    '.ts': 'typescript',
    '.svelte': 'svelte',
    '.py': 'python',
    '.json': 'json',
    '.md': 'markdown',
    '.css': 'css',
    '.html': 'html'
  };
  language = langMap[extension];

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
  let nextId: string | null = null;
  
  openBuffers.update(map => {
    const newMap = new Map(map);
    newMap.delete(id);
    
    if (get(activeBufferId) === id) {
      const keys = Array.from(newMap.keys());
      nextId = keys.length > 0 ? keys[keys.length - 1] : null;
    }
    
    return newMap;
  });

  if (nextId !== null || get(activeBufferId) === id) {
    activeBufferId.set(nextId);
  }
}