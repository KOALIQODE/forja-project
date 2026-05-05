import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import { THEMES } from '$lib/themes/index';

// ── Theme fixtures ─────────────────────────────────────────────────────────────

const mistoDark  = THEMES.find((t) => t.id === 'misto-dark')!;
const mistoLight = THEMES.find((t) => t.id === 'misto-light')!;

// ── Hoisted mock store ─────────────────────────────────────────────────────────

const mockThemeStore = vi.hoisted(() => {
  let _value: { vars: Record<string, string> } = { vars: {} };
  const _subs = new Set<(v: typeof _value) => void>();
  return {
    subscribe(fn: (v: typeof _value) => void) {
      fn(_value);
      _subs.add(fn);
      return () => { _subs.delete(fn); };
    },
    set(next: typeof _value) {
      _value = next;
      _subs.forEach((fn) => fn(_value));
    },
  };
});

const mockCurrentProject = vi.hoisted(() => {
  let _value: string | null = null;
  const _subs = new Set<(v: string | null) => void>();
  return {
    subscribe(fn: (v: string | null) => void) {
      fn(_value);
      _subs.add(fn);
      return () => { _subs.delete(fn); };
    },
    set(next: string | null) {
      _value = next;
      _subs.forEach((fn) => fn(_value));
    },
    _reset() { _value = null; _subs.forEach((fn) => fn(null)); },
  };
});

const mockPinnedPath = vi.hoisted(() => {
  let _value: string | null = null;
  const _subs = new Set<(v: string | null) => void>();
  return {
    subscribe(fn: (v: string | null) => void) {
      fn(_value);
      _subs.add(fn);
      return () => { _subs.delete(fn); };
    },
    set(next: string | null) {
      _value = next;
      _subs.forEach((fn) => fn(_value));
    },
    _reset() { _value = null; _subs.forEach((fn) => fn(null)); },
    pin: vi.fn(),
    unpin: vi.fn(),
  };
});

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  ask: vi.fn().mockResolvedValue(false),
}));

vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: mockThemeStore,
}));

vi.mock('$lib/stores/projectStore', () => ({
  currentProject: mockCurrentProject,
  closeProject: vi.fn(),
  openProject: vi.fn(),
}));

vi.mock('$lib/stores/bufferStore', () => ({
  openBuffer: vi.fn(),
  activeBufferId: readable(null),
}));

vi.mock('$lib/stores/todoStore', () => ({
  toggleTodoSidebar: vi.fn(),
}));

vi.mock('$lib/stores/explorerStore', () => {
  const expandedSet = new Set<string>();
  const expandedStore = {
    subscribe: vi.fn((fn: any) => { fn(expandedSet); return () => {}; }),
    toggle: vi.fn(),
    setExpanded: vi.fn(),
    has: vi.fn((p: string) => expandedSet.has(p)),
  };
  const cacheMap = new Map();
  const cacheStore = {
    subscribe: vi.fn((fn: any) => { fn(cacheMap); return () => {}; }),
    set: vi.fn(),
    get: vi.fn().mockReturnValue(undefined),
    clear: vi.fn(),
  };
  const inlineStore = {
    subscribe: vi.fn((fn: any) => { fn(null); return () => {}; }),
    setAction: vi.fn(),
    clear: vi.fn(),
  };
  return {
    expandedPaths: expandedStore,
    directoryCache: cacheStore,
    pinnedPath: mockPinnedPath,
    inlineAction: inlineStore,
  };
});

vi.mock('$lib/stores/preferencesStore', () => ({
  programPreferences: readable({ explorerWidth: 260 }),
  setProgramPreference: vi.fn(),
}));

// Mock child components to avoid deep dependency chains
vi.mock('$lib/components/explorer/FileDrillItem.svelte', () => ({
  default: { render: () => ({ c: () => {}, m: () => {}, d: () => {}, i: () => {}, o: () => {} }) },
}));
vi.mock('$lib/components/explorer/FileTreeItem.svelte', () => ({
  default: { render: () => ({ c: () => {}, m: () => {}, d: () => {}, i: () => {}, o: () => {} }) },
}));
vi.mock('$lib/components/ContextMenu.svelte', () => ({
  default: { render: () => ({ c: () => {}, m: () => {}, d: () => {}, i: () => {}, o: () => {} }) },
}));

// ── Imports after mocks ────────────────────────────────────────────────────────

import { invoke } from '@tauri-apps/api/core';
import { closeProject } from '$lib/stores/projectStore';
import { toggleTodoSidebar } from '$lib/stores/todoStore';
import Explorer from '$lib/components/explorer/Explorer.svelte';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getContainer() {
  return document.querySelector('[data-program-ui]') as HTMLElement;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Explorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    mockThemeStore.set(mistoDark);
    mockCurrentProject._reset();
  });

  // ── Render ───────────────────────────────────────────────────────────────────

  describe('render', () => {
    it('renders the Explorer label', () => {
      render(Explorer);
      expect(screen.getByText('Explorer')).toBeInTheDocument();
    });

    it('does not show project toolbar when no project is open', () => {
      render(Explorer);
      expect(screen.queryByTitle('Cerrar proyecto')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Cambiar modo de vista')).not.toBeInTheDocument();
    });

    it('shows toolbar buttons when a project is open', () => {
      mockCurrentProject.set('/my/project');
      render(Explorer);
      expect(screen.getByTitle('Cerrar proyecto')).toBeInTheDocument();
      expect(screen.getByTitle('Cambiar modo de vista')).toBeInTheDocument();
      expect(screen.getByTitle('Lista de TODOs del proyecto')).toBeInTheDocument();
    });
  });

  // ── Theme reactivity ──────────────────────────────────────────────────────────

  describe('theme reactivity', () => {
    it('applies Misto Dark CSS vars to the container', () => {
      mockThemeStore.set(mistoDark);
      render(Explorer);
      const style = getContainer().getAttribute('style') ?? '';
      expect(style).toContain('--forja-ui-text-primary');
    });

    it('applies Misto Light CSS vars to the container', () => {
      mockThemeStore.set(mistoLight);
      render(Explorer);
      const style = getContainer().getAttribute('style') ?? '';
      expect(style).toContain('--forja-ui-text-primary: #111111');
    });

    it('updates style when theme changes at runtime', async () => {
      mockThemeStore.set(mistoDark);
      render(Explorer);
      expect(getContainer().getAttribute('style')).toContain('--forja-ui-text-primary: #f4f4f5');

      mockThemeStore.set(mistoLight);
      await Promise.resolve();
      expect(getContainer().getAttribute('style')).toContain('--forja-ui-text-primary: #111111');
    });
  });

  // ── Toolbar actions ───────────────────────────────────────────────────────────

  describe('toolbar actions', () => {
    it('calls closeProject when close button is clicked', async () => {
      mockCurrentProject.set('/my/project');
      render(Explorer);
      await fireEvent.click(screen.getByTitle('Cerrar proyecto'));
      expect(closeProject).toHaveBeenCalledTimes(1);
    });

    it('calls toggleTodoSidebar when TODOs button is clicked', async () => {
      mockCurrentProject.set('/my/project');
      render(Explorer);
      await fireEvent.click(screen.getByTitle('Lista de TODOs del proyecto'));
      expect(toggleTodoSidebar).toHaveBeenCalledTimes(1);
    });

    it('toggles view mode button between drill and tree', async () => {
      mockCurrentProject.set('/my/project');
      render(Explorer);
      const toggleBtn = screen.getByTitle('Cambiar modo de vista');
      expect(toggleBtn).toBeInTheDocument();
      await fireEvent.click(toggleBtn);
      // button still present after toggle
      expect(screen.getByTitle('Cambiar modo de vista')).toBeInTheDocument();
    });
  });

  // ── Directory loading ─────────────────────────────────────────────────────────

  describe('directory loading', () => {
    it('invokes explore_directory when a project is set', async () => {
      mockCurrentProject.set('/my/project');
      render(Explorer);
      await Promise.resolve();
      await Promise.resolve();
      expect(invoke).toHaveBeenCalledWith('explore_directory', { path: '/my/project' });
    });

    it('does not invoke explore_directory when no project is set', async () => {
      render(Explorer);
      await Promise.resolve();
      expect(invoke).not.toHaveBeenCalledWith('explore_directory', expect.anything());
    });
  });
});
