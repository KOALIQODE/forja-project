import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: { subscribe: (fn: any) => { fn({ vars: {} }); return () => {}; } },
}));
vi.mock('$lib/utils/constants', () => ({
  EDITOR_CONFIG: { CHUNK_SIZE: 50, VISIBLE_LINES_OFFSET: 20 },
  TOKEN_COLORS: {},
}));
vi.mock('$lib/utils/ChunkRenderer', () => ({
  ChunkRenderer: class {
    invalidateAll() {}
    clear() {}
    markDirty() {}
  },
}));
vi.mock('$lib/utils/TextMetricsCache', () => ({
  TextMetricsCache: class { invalidateAll() {} },
}));
vi.mock('$lib/utils/WrapLayout', () => ({
  WrapLayout: class {
    totalVisualRows = 0;
    charsPerRow = 80;
    visualRowOfChar() { return 0; }
    visualToLogical() { return { line: 0, subRow: 0 }; }
  },
}));
vi.mock('$lib/components/editor/EditorRenderer', () => ({
  renderEditorFrame: vi.fn(),
}));
vi.mock('$lib/utils/documentBridge', () => ({
  DocumentBridge: class {
    open() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    isOpen() { return false; }
  },
}));
vi.mock('$lib/utils/diff', () => {
  class DiffScheduler {
    baselineManager = { getLines: () => [] as string[] };
    onDiffReady() { return () => {}; }
    notifyEdit() {}
    updateCurrentContent() {}
    initBaseline() {}
    reset() {}
    dispose() {}
  }
  class DiffRenderInvalidationManager { applyDiff() {} }
  class ViewportDiffCache { hasDecorations = false; update() {}; scroll() {}; clear() {} }
  class GitHunkManager { update() {}; clear() {}; getHunkAtLine() { return null; } getHunks() { return []; } }
  class HunkPreviewEngine { clearCache() {}; getPreview() { return []; } static toHTML() { return ''; } }
  return {
    DiffScheduler,
    DiffRenderInvalidationManager,
    ViewportDiffCache,
    GitHunkManager,
    HunkPreviewEngine,
    DIFF_COLORS: { added: '#0f0', deleted: '#f00', modified: '#ff0' },
  };
});
vi.mock('$lib/stores/editorStore', () => ({
  cursorPosition: { set: vi.fn(), subscribe: (fn: any) => { fn({ line: 1, column: 1 }); return () => {}; } },
  currentBreadcrumb: { set: vi.fn(), subscribe: (fn: any) => { fn(null); return () => {}; } },
  vimStatus: { set: vi.fn(), subscribe: (fn: any) => { fn({ mode: 'off', command: '', pending: '', count: '' }); return () => {}; } },
}));
vi.mock('$lib/stores/bufferStore', () => ({ closeBuffer: vi.fn() }));
vi.mock('$lib/stores/preferencesStore', () => ({
  bufferPreferences: {
    subscribe(fn: any) {
      fn({
        vimModeEnabled: false,
        fontFamily: 'monospace',
        fontSize: 14,
        lineHeight: 20,
        showLineNumbers: true,
        highlightActiveLine: true,
        softWrapEnabled: false,
      });
      return () => {};
    }
  },
}));
vi.mock('$lib/stores/dialogStore', () => ({
  dialogState: { subscribe(fn: any) { fn({ activeDialog: null }); return () => {}; } },
}));
vi.mock('$lib/stores/diagnosticsStore', () => ({
  diagnosticsByFile: { subscribe(fn: any) { fn(new Map()); return () => {}; } },
}));
vi.mock('$lib/utils/lspClient', () => ({
  lspOpenDocument: vi.fn(),
  lspChangeDocument: vi.fn(),
  lspCloseDocument: vi.fn(),
}));
vi.mock('$lib/utils/pluginClient', () => ({
  pluginRunBracketProviders: vi.fn().mockResolvedValue([]),
  pluginEmitEvent: vi.fn(),
}));
vi.mock('$lib/stores/pluginStore', () => ({
  activeTheme: { subscribe(fn: any) { fn(null); return () => {}; } },
  bracketRanges: { subscribe(fn: any) { fn([]); return () => {}; } },
  loadedPlugins: { subscribe(fn: any) { fn([]); return () => {}; } },
  pluginsReady: { subscribe(fn: any) { fn(false); return () => {}; } },
  pluginActivityVersion: { subscribe(fn: any) { fn(0); return () => {}; } },
}));
vi.mock('$lib/utils/themeEngine', () => ({
  bracketRangesToColors: vi.fn(() => []),
  resolveTokenColors: vi.fn(() => ({})),
}));
vi.mock('$lib/utils/diagnosticsUtils', () => ({
  buildDiagByLine: vi.fn(() => new Map()),
}));
vi.mock('$lib/utils/BracketColorizer', () => ({
  BracketColorizer: class { schedule() {} },
}));
vi.mock('$lib/components/editor/VimHandlers', () => ({
  handleCommandModeKeyDown: vi.fn(),
  handleInsertModeKeyDown: vi.fn(),
  handleNormalModeKeyDown: vi.fn(),
  handleVisualModeKeyDown: vi.fn(),
}));
vi.mock('$lib/components/editor/EditorFileInfo.svelte', () => ({
  default: () => null,
}));
vi.mock('$lib/utils/HighlightManager', () => ({
  HighlightManager: class {
    tokenCache = new Map();
    pendingChunks = new Set();
    loadedChunks = new Set();
    highlightEnabled = false;
    reset() {}
    cancelPendingDebounce() {}
    refreshHighlightAvailability() { return Promise.resolve(); }
    fetchChunk() {}
    scheduleHighlightRefresh() {}
    highlightViewportViaDocBridge() { return Promise.resolve(false); }
    rehighlightLoadedChunks() {}
    getCachedLinesForChunk() { return null; }
  },
}));

import EditorBuffer from '$lib/components/editor/EditorBuffer.svelte';

describe('EditorBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
      unobserve() {}
    });

    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_total_lines') return 1;
      if (command === 'read_file') return 'const value = 1;';
      if (command === 'get_file_head_content') return '';
      if (command === 'git_blame') return [];
      if (command === 'watch_directory') return null;
      if (command === 'get_code_breadcrumb') return null;
      return null;
    });
  });

  it('renders a data-buffer-ui element without crashing', () => {
    render(EditorBuffer, {
      filePath: '/project/src/main.ts',
      bufferId: '/project/src/main.ts',
      language: 'typescript',
    });

    expect(screen.getByRole('textbox', { name: 'Code editor' })).toHaveAttribute('data-buffer-ui');
  });
});
