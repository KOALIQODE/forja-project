import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetFileIcon = vi.hoisted(() => vi.fn());

vi.mock('$lib/utils/fileIcons', () => ({
  getFileIcon: mockGetFileIcon,
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
      // No icon element — just verify no crash and content still present
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
});
