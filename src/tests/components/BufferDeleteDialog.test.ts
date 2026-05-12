import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const mockInvoke = vi.hoisted(() => vi.fn());
const mockCloseBuffer = vi.hoisted(() => vi.fn());
const mockOpenBuffer = vi.hoisted(() => vi.fn());
const mockCloseDialog = vi.hoisted(() => vi.fn());

const mockOpenBuffers = vi.hoisted(() => {
  type Entry = { id: string; filePath: string; language?: string };
  type MapType = Map<string, Entry>;
  type Sub = (v: MapType) => void;
  let _value: MapType = new Map();
  const _subs = new Set<Sub>();
  return {
    subscribe(fn: Sub) { fn(_value); _subs.add(fn); return () => { _subs.delete(fn); }; },
    set(next: MapType) { _value = next; _subs.forEach(fn => fn(_value)); },
    update(fn: (v: MapType) => MapType) { const next = fn(_value); _value = next; _subs.forEach(fn => fn(_value)); },
  };
});

const mockActiveBufferId = vi.hoisted(() => {
  type Sub = (v: string | null) => void;
  let _value: string | null = null;
  const _subs = new Set<Sub>();
  return {
    subscribe(fn: Sub) { fn(_value); _subs.add(fn); return () => { _subs.delete(fn); }; },
    set(next: string | null) { _value = next; _subs.forEach(fn => fn(_value)); },
  };
});

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

vi.mock('$lib/stores/bufferStore', () => ({
  openBuffers: mockOpenBuffers,
  activeBufferId: mockActiveBufferId,
  closeBuffer: mockCloseBuffer,
  openBuffer: mockOpenBuffer,
}));

vi.mock('$lib/stores/dialogStore', () => ({
  closeDialog: mockCloseDialog,
}));

vi.mock('$lib/stores/projectStore', () => ({
  currentProject: { subscribe: (fn: (v: string | null) => void) => { fn('/home/user/myproject'); return () => {}; } },
}));

vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: { subscribe: (fn: (v: { vars: Record<string, string> }) => void) => { fn({ vars: {} }); return () => {}; } },
}));

// ── Imports after mocks ────────────────────────────────────────────────────────

import BufferDeleteDialog from '$lib/components/dialogs/BufferDeleteDialog.svelte';
import { GIT_STATUS_LABELS } from '$lib/utils/explorerHelpers';

// ── Helpers ────────────────────────────────────────────────────────────────────

function seedBuffers(entries: { filePath: string; language?: string }[], activeId?: string) {
  const map = new Map<string, { id: string; filePath: string; language?: string }>();
  for (const e of entries) {
    map.set(e.filePath, { id: e.filePath, filePath: e.filePath, language: e.language });
  }
  mockOpenBuffers.set(map);
  mockActiveBufferId.set(activeId ?? (entries.length > 0 ? entries[0].filePath : null));
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('BufferDeleteDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenBuffers.set(new Map());
    mockActiveBufferId.set(null);

    // Stub Element.animate for Svelte transitions in jsdom
    if (!Element.prototype.animate) {
      Element.prototype.animate = () =>
        ({ onfinish: null, cancel: () => {} } as unknown as Animation);
    }

    mockInvoke.mockResolvedValue({});
  });

  // ── Rendering ────────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the search input with placeholder "Find buffer..."', () => {
      render(BufferDeleteDialog);
      expect(screen.getByPlaceholderText('Find buffer...')).toBeInTheDocument();
    });

    it('renders [data-dialog-shell] with dialog-shell class', () => {
      const { container } = render(BufferDeleteDialog);
      const shell = container.querySelector('[data-dialog-shell]');
      expect(shell).not.toBeNull();
      expect(shell!.className).toMatch(/dialog-shell/);
    });

    it('shows "No open buffers" when list is empty', () => {
      render(BufferDeleteDialog);
      expect(screen.getByText(/No open buffers/)).toBeInTheDocument();
    });

    it('renders file names from openBuffers', async () => {
      seedBuffers([
        { filePath: '/home/user/myproject/src/alpha.ts' },
        { filePath: '/home/user/myproject/src/beta.svelte' },
      ]);

      render(BufferDeleteDialog);

      expect(screen.getByText('alpha.ts')).toBeInTheDocument();
      expect(screen.getByText('beta.svelte')).toBeInTheDocument();
    });

    it('renders directory path below each file name', () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/main.ts' }]);
      render(BufferDeleteDialog);
      expect(screen.getByText('/home/user/myproject/src')).toBeInTheDocument();
    });

    it('renders footer with buffer count', async () => {
      seedBuffers([
        { filePath: '/home/user/myproject/src/a.ts' },
        { filePath: '/home/user/myproject/src/b.ts' },
      ]);

      render(BufferDeleteDialog);

      expect(screen.getByText(/2 buffer/)).toBeInTheDocument();
    });

    it('shows singular "buffer" label for 1 buffer', () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/only.ts' }]);
      render(BufferDeleteDialog);
      expect(screen.getByText('1 buffer')).toBeInTheDocument();
    });
  });

  // ── Item list style ───────────────────────────────────────────────────────────

  describe('item list styling', () => {
    it('buffer items have buffer-item class', () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/a.ts' }]);
      const { container } = render(BufferDeleteDialog);
      const items = container.querySelectorAll('.buffer-item');
      expect(items.length).toBeGreaterThan(0);
    });

    it('first item has buffer-item--selected class on mount', () => {
      seedBuffers([
        { filePath: '/home/user/myproject/src/a.ts' },
        { filePath: '/home/user/myproject/src/b.ts' },
      ]);
      const { container } = render(BufferDeleteDialog);
      const selected = container.querySelector('.buffer-item--selected');
      expect(selected).not.toBeNull();
      // first item is selected
      const items = container.querySelectorAll('.buffer-item');
      expect(items[0].className).toContain('buffer-item--selected');
    });

    it('active buffer shows "active" badge', () => {
      const activeFile = '/home/user/myproject/src/active.ts';
      seedBuffers([
        { filePath: activeFile },
        { filePath: '/home/user/myproject/src/other.ts' },
      ], activeFile);

      render(BufferDeleteDialog);

      expect(screen.getByText('active')).toBeInTheDocument();
    });

    it('inactive buffer does not show "active" badge', () => {
      const activeFile = '/home/user/myproject/src/active.ts';
      seedBuffers([
        { filePath: activeFile },
        { filePath: '/home/user/myproject/src/other.ts' },
      ], activeFile);

      render(BufferDeleteDialog);

      // Should only be one "active" badge
      expect(screen.getAllByText('active')).toHaveLength(1);
    });
  });

  // ── git status badges ─────────────────────────────────────────────────────────

  describe('git status badges', () => {
    it('shows M badge for a modified buffer', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/modified.ts' }]);

      mockInvoke.mockResolvedValue({
        '/home/user/myproject/src/modified.ts': 'modified',
      });

      render(BufferDeleteDialog);

      await waitFor(() => {
        expect(screen.getByText(GIT_STATUS_LABELS.modified)).toBeInTheDocument();
      });
    });

    it('shows A badge for an added buffer', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/new.ts' }]);

      mockInvoke.mockResolvedValue({
        '/home/user/myproject/src/new.ts': 'added',
      });

      render(BufferDeleteDialog);

      await waitFor(() => {
        expect(screen.getByText(GIT_STATUS_LABELS.added)).toBeInTheDocument();
      });
    });

    it('shows D badge for a deleted buffer', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/gone.ts' }]);

      mockInvoke.mockResolvedValue({
        '/home/user/myproject/src/gone.ts': 'deleted',
      });

      render(BufferDeleteDialog);

      await waitFor(() => {
        expect(screen.getByText(GIT_STATUS_LABELS.deleted)).toBeInTheDocument();
      });
    });

    it('shows R badge for a renamed buffer', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/renamed.ts' }]);

      mockInvoke.mockResolvedValue({
        '/home/user/myproject/src/renamed.ts': 'renamed',
      });

      render(BufferDeleteDialog);

      await waitFor(() => {
        expect(screen.getByText(GIT_STATUS_LABELS.renamed)).toBeInTheDocument();
      });
    });

    it('shows U badge for an untracked buffer', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/untracked.ts' }]);

      mockInvoke.mockResolvedValue({
        '/home/user/myproject/src/untracked.ts': 'untracked',
      });

      render(BufferDeleteDialog);

      await waitFor(() => {
        expect(screen.getByText(GIT_STATUS_LABELS.untracked)).toBeInTheDocument();
      });
    });

    it('does not show any git badge when buffer has no git status', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/clean.ts' }]);
      mockInvoke.mockResolvedValue({});

      render(BufferDeleteDialog);

      await waitFor(() => {
        expect(screen.queryByText('M')).not.toBeInTheDocument();
        expect(screen.queryByText('A')).not.toBeInTheDocument();
        expect(screen.queryByText('D')).not.toBeInTheDocument();
        expect(screen.queryByText('R')).not.toBeInTheDocument();
        expect(screen.queryByText('U')).not.toBeInTheDocument();
      });
    });

    it('calls get_files_git_status with buffer file paths', async () => {
      seedBuffers([
        { filePath: '/home/user/myproject/src/a.ts' },
        { filePath: '/home/user/myproject/src/b.ts' },
      ]);

      mockInvoke.mockResolvedValue({});

      render(BufferDeleteDialog);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('get_files_git_status', expect.objectContaining({
          projectPath: '/home/user/myproject',
          filePaths: expect.arrayContaining([
            '/home/user/myproject/src/a.ts',
            '/home/user/myproject/src/b.ts',
          ]),
        }));
      });
    });

    it('git badge has correct color style for modified', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/mod.ts' }]);
      mockInvoke.mockResolvedValue({ '/home/user/myproject/src/mod.ts': 'modified' });

      render(BufferDeleteDialog);

      await waitFor(() => {
        const badge = screen.getByText('M');
        expect(badge.getAttribute('style')).toContain('var(--forja-ui-git-modified, #fb923c)');
      });
    });

    it('git badge has correct color style for added', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/new.ts' }]);
      mockInvoke.mockResolvedValue({ '/home/user/myproject/src/new.ts': 'added' });

      render(BufferDeleteDialog);

      await waitFor(() => {
        const badge = screen.getByText('A');
        expect(badge.getAttribute('style')).toContain('var(--forja-ui-git-added, #4ade80)');
      });
    });

    it('git badge has correct color style for deleted', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/gone.ts' }]);
      mockInvoke.mockResolvedValue({ '/home/user/myproject/src/gone.ts': 'deleted' });

      render(BufferDeleteDialog);

      await waitFor(() => {
        const badge = screen.getByText('D');
        expect(badge.getAttribute('style')).toContain('var(--forja-ui-git-deleted, #f87171)');
      });
    });

    it('git badge has correct color style for renamed', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/renamed.ts' }]);
      mockInvoke.mockResolvedValue({ '/home/user/myproject/src/renamed.ts': 'renamed' });

      render(BufferDeleteDialog);

      await waitFor(() => {
        const badge = screen.getByText('R');
        expect(badge.getAttribute('style')).toContain('var(--forja-ui-git-renamed, #60a5fa)');
      });
    });

    it('git badge has correct color style for untracked', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/new2.ts' }]);
      mockInvoke.mockResolvedValue({ '/home/user/myproject/src/new2.ts': 'untracked' });

      render(BufferDeleteDialog);

      await waitFor(() => {
        const badge = screen.getByText('U');
        expect(badge.getAttribute('style')).toContain('var(--forja-ui-git-untracked, #9a9aaa)');
      });
    });

    it('git badge sits inside the buffer-item row', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/mod.ts' }]);
      mockInvoke.mockResolvedValue({ '/home/user/myproject/src/mod.ts': 'modified' });

      const { container } = render(BufferDeleteDialog);

      await waitFor(() => {
        const badge = screen.getByText('M');
        const item = badge.closest('.buffer-item');
        expect(item).not.toBeNull();
      });
    });
  });

  // ── keyboard navigation ───────────────────────────────────────────────────────

  describe('keyboard navigation', () => {
    it('Escape closes the dialog', async () => {
      render(BufferDeleteDialog);
      const input = screen.getByPlaceholderText('Find buffer...');
      await fireEvent.keyDown(input, { key: 'Escape' });
      expect(mockCloseDialog).toHaveBeenCalledTimes(1);
    });

    it('Enter selects the highlighted buffer and closes dialog', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/a.ts' }]);
      mockInvoke.mockResolvedValue({});

      render(BufferDeleteDialog);
      const input = screen.getByPlaceholderText('Find buffer...');
      await fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOpenBuffer).toHaveBeenCalledWith('/home/user/myproject/src/a.ts');
      expect(mockCloseDialog).toHaveBeenCalledTimes(1);
    });

    it('ArrowDown moves selection to the next buffer', async () => {
      seedBuffers([
        { filePath: '/home/user/myproject/src/a.ts' },
        { filePath: '/home/user/myproject/src/b.ts' },
      ]);
      mockInvoke.mockResolvedValue({});

      const { container } = render(BufferDeleteDialog);
      const input = screen.getByPlaceholderText('Find buffer...');
      await fireEvent.keyDown(input, { key: 'ArrowDown' });

      const items = container.querySelectorAll('.buffer-item');
      expect(items[1].className).toContain('buffer-item--selected');
    });

    it('ArrowUp wraps to last buffer when on first', async () => {
      seedBuffers([
        { filePath: '/home/user/myproject/src/a.ts' },
        { filePath: '/home/user/myproject/src/b.ts' },
      ]);
      mockInvoke.mockResolvedValue({});

      const { container } = render(BufferDeleteDialog);
      const input = screen.getByPlaceholderText('Find buffer...');
      await fireEvent.keyDown(input, { key: 'ArrowUp' });

      const items = container.querySelectorAll('.buffer-item');
      expect(items[items.length - 1].className).toContain('buffer-item--selected');
    });

    it('ctrl+d closes the selected buffer', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/a.ts' }]);
      mockInvoke.mockResolvedValue({});

      render(BufferDeleteDialog);
      const input = screen.getByPlaceholderText('Find buffer...');
      await fireEvent.keyDown(input, { key: 'd', ctrlKey: true });

      expect(mockCloseBuffer).toHaveBeenCalledWith('/home/user/myproject/src/a.ts');
    });
  });

  // ── search filtering ──────────────────────────────────────────────────────────

  describe('search filtering', () => {
    it('filters buffers by file name', async () => {
      seedBuffers([
        { filePath: '/home/user/myproject/src/alpha.ts' },
        { filePath: '/home/user/myproject/src/beta.ts' },
      ]);
      mockInvoke.mockResolvedValue({});

      render(BufferDeleteDialog);
      const input = screen.getByPlaceholderText('Find buffer...');
      await fireEvent.input(input, { target: { value: 'alpha' } });

      expect(screen.getByText('alpha.ts')).toBeInTheDocument();
      expect(screen.queryByText('beta.ts')).not.toBeInTheDocument();
    });

    it('filters buffers by path', async () => {
      seedBuffers([
        { filePath: '/home/user/myproject/feature/auth.ts' },
        { filePath: '/home/user/myproject/core/router.ts' },
      ]);
      mockInvoke.mockResolvedValue({});

      render(BufferDeleteDialog);
      const input = screen.getByPlaceholderText('Find buffer...');
      await fireEvent.input(input, { target: { value: 'feature' } });

      expect(screen.getByText('auth.ts')).toBeInTheDocument();
      expect(screen.queryByText('router.ts')).not.toBeInTheDocument();
    });

    it('updates footer count after filtering', async () => {
      seedBuffers([
        { filePath: '/home/user/myproject/src/alpha.ts' },
        { filePath: '/home/user/myproject/src/beta.ts' },
      ]);
      mockInvoke.mockResolvedValue({});

      render(BufferDeleteDialog);
      expect(screen.getByText(/2 buffer/)).toBeInTheDocument();

      const input = screen.getByPlaceholderText('Find buffer...');
      await fireEvent.input(input, { target: { value: 'alpha' } });

      expect(screen.getByText('1 buffer')).toBeInTheDocument();
    });
  });

  // ── click interactions ────────────────────────────────────────────────────────

  describe('click interactions', () => {
    it('clicking a buffer item calls openBuffer and closeDialog', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/click-me.ts' }]);
      mockInvoke.mockResolvedValue({});

      render(BufferDeleteDialog);
      await fireEvent.click(screen.getByText('click-me.ts'));

      expect(mockOpenBuffer).toHaveBeenCalledWith('/home/user/myproject/src/click-me.ts');
      expect(mockCloseDialog).toHaveBeenCalledTimes(1);
    });

    it('clicking the trash icon removes the buffer without opening it', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/removable.ts' }]);
      mockInvoke.mockResolvedValue({});

      const { container } = render(BufferDeleteDialog);

      // Hover to make close button visible (it starts opacity-0)
      const item = container.querySelector('.buffer-item') as HTMLElement;
      await fireEvent.mouseEnter(item);

      const closeBtn = container.querySelector('.close-item-btn') as HTMLElement;
      await fireEvent.click(closeBtn);

      expect(mockCloseBuffer).toHaveBeenCalledWith('/home/user/myproject/src/removable.ts');
      expect(mockOpenBuffer).not.toHaveBeenCalled();
    });
  });
});
