import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

const mockActiveBuffer = vi.hoisted(() => {
  let _value: { id: string; filePath: string; language?: string } | null = null;
  const _subs = new Set<(value: typeof _value) => void>();
  return {
    subscribe(fn: (value: typeof _value) => void) {
      fn(_value);
      _subs.add(fn);
      return () => {
        _subs.delete(fn);
      };
    },
    set(next: typeof _value) {
      _value = next;
      _subs.forEach((fn) => fn(_value));
    },
    _reset() {
      _value = null;
      _subs.forEach((fn) => fn(null));
    },
  };
});

const mockActiveBufferId = vi.hoisted(() => {
  let _value: string | null = null;
  const _subs = new Set<(value: typeof _value) => void>();
  return {
    subscribe(fn: (value: typeof _value) => void) {
      fn(_value);
      _subs.add(fn);
      return () => {
        _subs.delete(fn);
      };
    },
    set(next: typeof _value) {
      _value = next;
      _subs.forEach((fn) => fn(_value));
    },
    _reset() {
      _value = null;
      _subs.forEach((fn) => fn(null));
    },
  };
});

const mockOpenBuffers = vi.hoisted(() => {
  let _value = new Map<string, { id: string; filePath: string }>();
  const _subs = new Set<(value: typeof _value) => void>();
  return {
    subscribe(fn: (value: typeof _value) => void) {
      fn(_value);
      _subs.add(fn);
      return () => {
        _subs.delete(fn);
      };
    },
    set(next: typeof _value) {
      _value = next;
      _subs.forEach((fn) => fn(_value));
    },
    _reset() {
      _value = new Map();
      _subs.forEach((fn) => fn(_value));
    },
  };
});

const mockCursorPosition = vi.hoisted(() => {
  let _value = { line: 1, column: 1 };
  const _subs = new Set<(value: typeof _value) => void>();
  return {
    subscribe(fn: (value: typeof _value) => void) {
      fn(_value);
      _subs.add(fn);
      return () => {
        _subs.delete(fn);
      };
    },
    set(next: typeof _value) {
      _value = next;
      _subs.forEach((fn) => fn(_value));
    },
    _reset() {
      _value = { line: 1, column: 1 };
      _subs.forEach((fn) => fn(_value));
    },
  };
});

const mockCurrentBreadcrumb = vi.hoisted(() => {
  let _value = { items: [] as Array<{ name: string; kind: string; line: number; column: number }> };
  const _subs = new Set<(value: typeof _value) => void>();
  return {
    subscribe(fn: (value: typeof _value) => void) {
      fn(_value);
      _subs.add(fn);
      return () => {
        _subs.delete(fn);
      };
    },
    set(next: typeof _value) {
      _value = next;
      _subs.forEach((fn) => fn(_value));
    },
    _reset() {
      _value = { items: [] };
      _subs.forEach((fn) => fn(_value));
    },
  };
});

const mockVimStatus = vi.hoisted(() => {
  let _value = { mode: 'off', command: '', pending: '', count: '' };
  const _subs = new Set<(value: typeof _value) => void>();
  return {
    subscribe(fn: (value: typeof _value) => void) {
      fn(_value);
      _subs.add(fn);
      return () => {
        _subs.delete(fn);
      };
    },
    set(next: typeof _value) {
      _value = next;
      _subs.forEach((fn) => fn(_value));
    },
    _reset() {
      _value = { mode: 'off', command: '', pending: '', count: '' };
      _subs.forEach((fn) => fn(_value));
    },
  };
});

const mockErrorCount = vi.hoisted(() => {
  let _value = 0;
  const _subs = new Set<(value: number) => void>();
  return {
    subscribe(fn: (value: number) => void) {
      fn(_value);
      _subs.add(fn);
      return () => {
        _subs.delete(fn);
      };
    },
    set(next: number) {
      _value = next;
      _subs.forEach((fn) => fn(_value));
    },
    _reset() {
      _value = 0;
      _subs.forEach((fn) => fn(_value));
    },
  };
});

const mockWarningCount = vi.hoisted(() => {
  let _value = 0;
  const _subs = new Set<(value: number) => void>();
  return {
    subscribe(fn: (value: number) => void) {
      fn(_value);
      _subs.add(fn);
      return () => {
        _subs.delete(fn);
      };
    },
    set(next: number) {
      _value = next;
      _subs.forEach((fn) => fn(_value));
    },
    _reset() {
      _value = 0;
      _subs.forEach((fn) => fn(_value));
    },
  };
});

const mockActiveUITheme = vi.hoisted(() => {
  let _value = { vars: {} as Record<string, string> };
  const _subs = new Set<(v: typeof _value) => void>();
  return {
    subscribe(fn: (v: typeof _value) => void) {
      fn(_value);
      _subs.add(fn);
      return () => _subs.delete(fn);
    },
    set(next: typeof _value) {
      _value = next;
      _subs.forEach((fn) => fn(_value));
    },
    _reset() {
      _value = { vars: {} };
      _subs.forEach((fn) => fn({ vars: {} }));
    },
  };
});

const mockOpenBufferDeleteDialog = vi.hoisted(() => vi.fn());

vi.mock('$lib/stores/bufferStore', () => ({
  activeBuffer: mockActiveBuffer,
  activeBufferId: mockActiveBufferId,
  openBuffers: mockOpenBuffers,
}));

vi.mock('$lib/stores/editorStore', () => ({
  cursorPosition: mockCursorPosition,
  currentBreadcrumb: mockCurrentBreadcrumb,
  vimStatus: mockVimStatus,
}));

vi.mock('$lib/stores/diagnosticsStore', () => ({
  errorCount: mockErrorCount,
  warningCount: mockWarningCount,
}));

vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: mockActiveUITheme,
}));

vi.mock('$lib/stores/dialogStore', () => ({
  openBufferDeleteDialog: mockOpenBufferDeleteDialog,
}));

import StatusBar from '$lib/components/StatusBar.svelte';

function setActiveBuffer(filePath: string) {
  mockActiveBuffer.set({ id: filePath, filePath, language: 'typescript' });
  mockActiveBufferId.set(filePath);
}

describe('StatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveBuffer._reset();
    mockActiveBufferId._reset();
    mockOpenBuffers._reset();
    mockCursorPosition._reset();
    mockCurrentBreadcrumb._reset();
    mockVimStatus._reset();
    mockErrorCount._reset();
    mockWarningCount._reset();
    mockActiveUITheme._reset();
  });

  describe('render', () => {
    it('renders status bar element', () => {
      render(StatusBar);
      expect(screen.getByTestId('status-bar')).toBeInTheDocument();
    });

    it('renders "No buffer open" when no active buffer', () => {
      render(StatusBar);
      expect(screen.getByText('No buffer open')).toBeInTheDocument();
    });

    it('renders file name when buffer is active', () => {
      setActiveBuffer('/workspace/src/lib/StatusBar.svelte');
      render(StatusBar);
      expect(screen.getByTestId('status-file-name')).toHaveTextContent('StatusBar.svelte');
    });

    it('renders cursor position', () => {
      mockCursorPosition.set({ line: 12, column: 34 });
      render(StatusBar);
      expect(screen.getByTestId('status-cursor')).toHaveTextContent('Ln 12, Col 34');
    });
  });

  describe('diagnostics', () => {
    it('shows error count', () => {
      mockErrorCount.set(3);
      render(StatusBar);
      expect(screen.getByTestId('status-error-count')).toHaveTextContent('3');
    });

    it('shows warning count', () => {
      mockWarningCount.set(2);
      render(StatusBar);
      expect(screen.getByTestId('status-warning-count')).toHaveTextContent('2');
    });
  });

  describe('vim mode', () => {
    it('shows VIM OFF when mode is off', () => {
      render(StatusBar);
      expect(screen.getByTestId('status-vim-mode')).toHaveTextContent('VIM OFF');
    });

    it('shows NORMAL when mode is normal', () => {
      mockVimStatus.set({ mode: 'normal', command: '', pending: '', count: '' });
      render(StatusBar);
      expect(screen.getByTestId('status-vim-mode')).toHaveTextContent('NORMAL');
    });

    it('shows INSERT when mode is insert', () => {
      mockVimStatus.set({ mode: 'insert', command: '', pending: '', count: '' });
      render(StatusBar);
      expect(screen.getByTestId('status-vim-mode')).toHaveTextContent('INSERT');
    });

    it('shows command with colon prefix when mode is command with pending command', () => {
      mockVimStatus.set({ mode: 'command', command: 'wq', pending: '', count: '' });
      render(StatusBar);
      expect(screen.getByTestId('status-vim-mode')).toHaveTextContent(':wq');
    });
  });

  describe('buffer count', () => {
    it('shows correct buffer count', async () => {
      mockOpenBuffers.set(
        new Map([
          ['/workspace/a.ts', { id: '/workspace/a.ts', filePath: '/workspace/a.ts' }],
          ['/workspace/b.ts', { id: '/workspace/b.ts', filePath: '/workspace/b.ts' }],
          ['/workspace/c.ts', { id: '/workspace/c.ts', filePath: '/workspace/c.ts' }],
        ])
      );
      render(StatusBar);
      expect(screen.getByTestId('status-buffer-count')).toHaveTextContent('3');
      await fireEvent.click(screen.getByRole('button'));
      expect(mockOpenBufferDeleteDialog).toHaveBeenCalledTimes(1);
    });
  });

  describe('breadcrumb', () => {
    it('renders breadcrumb items when currentBreadcrumb has items', () => {
      setActiveBuffer('/workspace/src/routes/+page.svelte');
      mockCurrentBreadcrumb.set({
        items: [
          { name: 'loadData', kind: 'function_declaration', line: 10, column: 2 },
          { name: 'result', kind: 'pair', line: 12, column: 4 },
        ],
      });
      render(StatusBar);
      expect(screen.getByText('loadData')).toBeInTheDocument();
      expect(screen.getByText('result')).toBeInTheDocument();
    });
  });

  describe('theme reactivity', () => {
    it('updates inline theme vars when theme changes at runtime', async () => {
      render(StatusBar);
      expect(screen.getByTestId('status-bar').getAttribute('style') ?? '').not.toContain('--forja-ui-btn-border: #222');
      mockActiveUITheme.set({ vars: { '--forja-ui-btn-border': '#222' } });
      await Promise.resolve();
      expect(screen.getByTestId('status-bar').getAttribute('style') ?? '').toContain('--forja-ui-btn-border: #222');
    });
  });
});
