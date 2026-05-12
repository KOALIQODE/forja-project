import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetFileIcon = vi.hoisted(() => vi.fn());

vi.mock('$lib/utils/fileIcons', () => ({
  getFileIcon: mockGetFileIcon,
}));

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

vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: mockActiveUITheme,
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import EditorFileInfo from '$lib/components/editor/EditorFileInfo.svelte';

// ── Helpers ────────────────────────────────────────────────────────────────

function renderFileInfo(props: { filePath: string; isDirty: boolean; totalLines: number }) {
  return render(EditorFileInfo, { props });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('EditorFileInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileIcon.mockReturnValue(null);
    mockActiveUITheme._reset();
  });

  describe('render', () => {
    it('renders the root element with correct testid', () => {
      renderFileInfo({ filePath: '/src/main.ts', isDirty: false, totalLines: 10 });
      expect(screen.getByTestId('editor-file-info')).toBeInTheDocument();
    });

    it('extracts and displays the file name from a Unix path', () => {
      renderFileInfo({ filePath: '/workspace/src/lib/utils/diff.ts', isDirty: false, totalLines: 1 });
      expect(screen.getByTestId('editor-file-info')).toHaveTextContent('diff.ts');
    });

    it('extracts and displays the file name from a Windows path', () => {
      renderFileInfo({ filePath: 'C:\\Users\\dev\\project\\index.svelte', isDirty: false, totalLines: 1 });
      expect(screen.getByTestId('editor-file-info')).toHaveTextContent('index.svelte');
    });

    it('falls back to full path when path has no separator', () => {
      renderFileInfo({ filePath: 'README.md', isDirty: false, totalLines: 5 });
      expect(screen.getByTestId('editor-file-info')).toHaveTextContent('README.md');
    });
  });

  describe('line count', () => {
    it('displays total lines', () => {
      renderFileInfo({ filePath: '/src/app.ts', isDirty: false, totalLines: 420 });
      expect(screen.getByTestId('editor-file-info')).toHaveTextContent('420');
    });

    it('formats large line counts with locale separators', () => {
      renderFileInfo({ filePath: '/src/big.ts', isDirty: false, totalLines: 12345 });
      expect(screen.getByTestId('editor-file-info')).toHaveTextContent('12,345');
    });

    it('displays the "LN" label', () => {
      renderFileInfo({ filePath: '/src/app.ts', isDirty: false, totalLines: 1 });
      expect(screen.getByTestId('editor-file-info')).toHaveTextContent('LN');
    });
  });

  describe('dirty indicator', () => {
    it('shows the dirty dot when isDirty is true', () => {
      renderFileInfo({ filePath: '/src/app.ts', isDirty: true, totalLines: 10 });
      expect(screen.getByTitle('Unsaved changes')).toBeInTheDocument();
    });

    it('hides the dirty dot when isDirty is false', () => {
      renderFileInfo({ filePath: '/src/app.ts', isDirty: false, totalLines: 10 });
      expect(screen.queryByTitle('Unsaved changes')).not.toBeInTheDocument();
    });
  });

  describe('file icon', () => {
    it('does not render an icon when getFileIcon returns null', () => {
      mockGetFileIcon.mockReturnValue(null);
      renderFileInfo({ filePath: '/src/app.ts', isDirty: false, totalLines: 1 });
      expect(screen.getByTestId('editor-file-info')).toHaveTextContent('app.ts');
    });

    it('calls getFileIcon with the derived file name', () => {
      renderFileInfo({ filePath: '/project/src/Editor.svelte', isDirty: false, totalLines: 1 });
      expect(mockGetFileIcon).toHaveBeenCalledWith('Editor.svelte');
    });

    it('calls getFileIcon with the bare filename when no directory is present', () => {
      renderFileInfo({ filePath: 'Cargo.toml', isDirty: false, totalLines: 1 });
      expect(mockGetFileIcon).toHaveBeenCalledWith('Cargo.toml');
    });
  });

  describe('theme reactivity', () => {
    it('applies theme vars as inline styles on the root element', () => {
      mockActiveUITheme.set({ vars: { '--forja-editor-bg': '#1a1a2e', '--forja-ui-btn-border': '#2a2a3e' } });
      renderFileInfo({ filePath: '/src/app.ts', isDirty: false, totalLines: 1 });
      const style = screen.getByTestId('editor-file-info').getAttribute('style') ?? '';
      expect(style).toContain('--forja-editor-bg');
      expect(style).toContain('--forja-ui-btn-border');
    });

    it('updates inline theme vars when theme changes at runtime', async () => {
      renderFileInfo({ filePath: '/src/app.ts', isDirty: false, totalLines: 1 });
      expect(screen.getByTestId('editor-file-info').getAttribute('style') ?? '').not.toContain('--forja-editor-bg: #ffffff');
      mockActiveUITheme.set({ vars: { '--forja-editor-bg': '#ffffff' } });
      await Promise.resolve();
      expect(screen.getByTestId('editor-file-info').getAttribute('style') ?? '').toContain('--forja-editor-bg: #ffffff');
    });
  });
});
