import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const mockInvoke = vi.hoisted(() => vi.fn());

// Reactive openBuffers store — must be hoisted without svelte/store import
const mockOpenBuffers = vi.hoisted(() => {
  type Entry = { id: string; filePath: string; language?: string };
  type MapType = Map<string, Entry>;
  type Sub = (v: MapType) => void;
  let _value: MapType = new Map();
  const _subs = new Set<Sub>();
  return {
    subscribe(fn: Sub) { fn(_value); _subs.add(fn); return () => { _subs.delete(fn); }; },
    set(next: MapType) { _value = next; _subs.forEach(fn => fn(_value)); },
  };
});

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

vi.mock('$lib/stores/dialogStore', () => ({
  closeDialog: vi.fn(),
}));

vi.mock('$lib/stores/projectStore', () => ({
  currentProject: { subscribe: (fn: (v: string) => void) => { fn('/home/user/myproject'); return () => {}; } },
}));

vi.mock('$lib/stores/bufferStore', () => ({
  openBuffers: mockOpenBuffers,
  openBuffer: vi.fn(),
}));

vi.mock('$lib/stores/pluginStore', () => ({
  activeTheme: { subscribe: (fn: (v: null) => void) => { fn(null); return () => {}; } },
}));

vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: { subscribe: (fn: (v: { vars: Record<string, string> }) => void) => { fn({ vars: {} }); return () => {}; } },
}));

// ── Imports after mocks ────────────────────────────────────────────────────────

import Telescope from '$lib/components/dialogs/Telescope.svelte';
import { closeDialog } from '$lib/stores/dialogStore';
import { GIT_STATUS_LABELS } from '$lib/utils/explorerHelpers';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Default file results returned by search_files */
function makeFileResults(overrides: Partial<{
  name: string; path: string; git_status: string | null;
}>[] = []) {
  return [
    {
      name: 'main.ts',
      path: '/home/user/myproject/src/main.ts',
      is_dir: false,
      extension: 'ts',
      git_status: null,
      ...overrides[0],
    },
    {
      name: 'App.svelte',
      path: '/home/user/myproject/src/App.svelte',
      is_dir: false,
      extension: 'svelte',
      git_status: null,
      ...overrides[1],
    },
  ];
}

/** Populate the openBuffers store with test data */
function seedBuffers(entries: { filePath: string }[]) {
  const map = new Map<string, { filePath: string; id: string; language?: string }>();
  for (const e of entries) {
    map.set(e.filePath, { id: e.filePath, filePath: e.filePath });
  }
  mockOpenBuffers.set(map);
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('Telescope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenBuffers.set(new Map());

    // Stub Element.animate for Svelte transitions in jsdom
    if (!Element.prototype.animate) {
      Element.prototype.animate = () =>
        ({ onfinish: null, cancel: () => {} } as unknown as Animation);
    }

    // Default: search_files returns empty, git status returns empty
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'search_files') return Promise.resolve([]);
      if (cmd === 'get_files_git_status') return Promise.resolve({});
      if (cmd === 'read_file_lines') return Promise.resolve([]);
      if (cmd === 'detect_language') return Promise.resolve('unknown');
      return Promise.resolve(null);
    });
  });

  // ── Rendering ────────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the search input with placeholder "Search..." for files mode', () => {
      render(Telescope, { mode: 'files' });
      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });

    it('renders the search input with placeholder "Search..." for buffers mode', () => {
      render(Telescope, { mode: 'buffers' });
      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });

    it('renders the search input with placeholder "Search..." for grep mode', () => {
      render(Telescope, { mode: 'grep' });
      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });

    it('shows FIND FILES label for files mode', () => {
      render(Telescope, { mode: 'files' });
      expect(screen.getByText('FIND FILES')).toBeInTheDocument();
    });

    it('shows BUFFERS label for buffers mode', () => {
      render(Telescope, { mode: 'buffers' });
      expect(screen.getByText('BUFFERS')).toBeInTheDocument();
    });

    it('shows LIVE GREP label for grep mode', () => {
      render(Telescope, { mode: 'grep' });
      expect(screen.getByText('LIVE GREP')).toBeInTheDocument();
    });

    it('renders [data-dialog-shell] with telescope-shell class', () => {
      const { container } = render(Telescope, { mode: 'files' });
      const shell = container.querySelector('[data-dialog-shell]');
      expect(shell).not.toBeNull();
      expect(shell!.className).toMatch(/telescope-shell/);
    });

    it('renders empty state when no results', () => {
      render(Telescope, { mode: 'files' });
      expect(screen.getByText('No results')).toBeInTheDocument();
    });
  });

  // ── files mode: git status display ───────────────────────────────────────────

  describe('find files — git status badges', () => {
    it('shows M badge for modified file', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'search_files') return Promise.resolve(makeFileResults());
        if (cmd === 'get_files_git_status') return Promise.resolve({
          '/home/user/myproject/src/main.ts': 'modified',
        });
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      const { container } = render(Telescope, { mode: 'files' });
      const input = screen.getByPlaceholderText('Search...');
      await fireEvent.input(input, { target: { value: 'main' } });

      await waitFor(() => {
        expect(screen.getByText(GIT_STATUS_LABELS.modified)).toBeInTheDocument();
      });
    });

    it('shows A badge for added file', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'search_files') return Promise.resolve(makeFileResults());
        if (cmd === 'get_files_git_status') return Promise.resolve({
          '/home/user/myproject/src/main.ts': 'added',
        });
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      render(Telescope, { mode: 'files' });
      const input = screen.getByPlaceholderText('Search...');
      await fireEvent.input(input, { target: { value: 'main' } });

      await waitFor(() => {
        expect(screen.getByText(GIT_STATUS_LABELS.added)).toBeInTheDocument();
      });
    });

    it('shows D badge for deleted file', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'search_files') return Promise.resolve(makeFileResults());
        if (cmd === 'get_files_git_status') return Promise.resolve({
          '/home/user/myproject/src/main.ts': 'deleted',
        });
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      render(Telescope, { mode: 'files' });
      const input = screen.getByPlaceholderText('Search...');
      await fireEvent.input(input, { target: { value: 'main' } });

      await waitFor(() => {
        expect(screen.getByText(GIT_STATUS_LABELS.deleted)).toBeInTheDocument();
      });
    });

    it('shows R badge for renamed file', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'search_files') return Promise.resolve(makeFileResults());
        if (cmd === 'get_files_git_status') return Promise.resolve({
          '/home/user/myproject/src/main.ts': 'renamed',
        });
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      render(Telescope, { mode: 'files' });
      const input = screen.getByPlaceholderText('Search...');
      await fireEvent.input(input, { target: { value: 'main' } });

      await waitFor(() => {
        expect(screen.getByText(GIT_STATUS_LABELS.renamed)).toBeInTheDocument();
      });
    });

    it('shows U badge for untracked file', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'search_files') return Promise.resolve(makeFileResults());
        if (cmd === 'get_files_git_status') return Promise.resolve({
          '/home/user/myproject/src/main.ts': 'untracked',
        });
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      render(Telescope, { mode: 'files' });
      const input = screen.getByPlaceholderText('Search...');
      await fireEvent.input(input, { target: { value: 'main' } });

      await waitFor(() => {
        expect(screen.getByText(GIT_STATUS_LABELS.untracked)).toBeInTheDocument();
      });
    });

    it('does not render any git badge when file has no git status', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'search_files') return Promise.resolve(makeFileResults());
        if (cmd === 'get_files_git_status') return Promise.resolve({});
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      render(Telescope, { mode: 'files' });
      const input = screen.getByPlaceholderText('Search...');
      await fireEvent.input(input, { target: { value: 'main' } });

      await waitFor(() => {
        expect(screen.queryByText('M')).not.toBeInTheDocument();
        expect(screen.queryByText('A')).not.toBeInTheDocument();
        expect(screen.queryByText('D')).not.toBeInTheDocument();
        expect(screen.queryByText('R')).not.toBeInTheDocument();
        expect(screen.queryByText('U')).not.toBeInTheDocument();
      });
    });

    it('calls get_files_git_status with the paths returned by search_files', async () => {
      const fileResults = makeFileResults();
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'search_files') return Promise.resolve(fileResults);
        if (cmd === 'get_files_git_status') return Promise.resolve({});
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      render(Telescope, { mode: 'files' });
      const input = screen.getByPlaceholderText('Search...');
      await fireEvent.input(input, { target: { value: 'main' } });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('get_files_git_status', expect.objectContaining({
          projectPath: '/home/user/myproject',
          filePaths: expect.arrayContaining([
            '/home/user/myproject/src/main.ts',
            '/home/user/myproject/src/App.svelte',
          ]),
        }));
      });
    });

    it('renders file names from search results', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'search_files') return Promise.resolve(makeFileResults());
        if (cmd === 'get_files_git_status') return Promise.resolve({});
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      render(Telescope, { mode: 'files' });
      const input = screen.getByPlaceholderText('Search...');
      await fireEvent.input(input, { target: { value: 'ts' } });

      await waitFor(() => {
        expect(screen.getByText('main.ts')).toBeInTheDocument();
        expect(screen.getByText('App.svelte')).toBeInTheDocument();
      });
    });
  });

  // ── buffers mode: git status display ─────────────────────────────────────────

  describe('buffers mode — git status badges', () => {
    it('shows M badge for a modified buffer', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/main.ts' }]);

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'get_files_git_status') return Promise.resolve({
          '/home/user/myproject/src/main.ts': 'modified',
        });
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      render(Telescope, { mode: 'buffers' });

      await waitFor(() => {
        expect(screen.getByText(GIT_STATUS_LABELS.modified)).toBeInTheDocument();
      });
    });

    it('shows A badge for an added buffer', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/new-file.ts' }]);

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'get_files_git_status') return Promise.resolve({
          '/home/user/myproject/src/new-file.ts': 'added',
        });
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      render(Telescope, { mode: 'buffers' });

      await waitFor(() => {
        expect(screen.getByText(GIT_STATUS_LABELS.added)).toBeInTheDocument();
      });
    });

    it('shows D badge for a deleted buffer', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/gone.ts' }]);

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'get_files_git_status') return Promise.resolve({
          '/home/user/myproject/src/gone.ts': 'deleted',
        });
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      render(Telescope, { mode: 'buffers' });

      await waitFor(() => {
        expect(screen.getByText(GIT_STATUS_LABELS.deleted)).toBeInTheDocument();
      });
    });

    it('shows U badge for an untracked buffer', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/untracked.ts' }]);

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'get_files_git_status') return Promise.resolve({
          '/home/user/myproject/src/untracked.ts': 'untracked',
        });
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      render(Telescope, { mode: 'buffers' });

      await waitFor(() => {
        expect(screen.getByText(GIT_STATUS_LABELS.untracked)).toBeInTheDocument();
      });
    });

    it('does not show a badge when buffer has no git status', async () => {
      seedBuffers([{ filePath: '/home/user/myproject/src/clean.ts' }]);

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'get_files_git_status') return Promise.resolve({});
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      render(Telescope, { mode: 'buffers' });

      await waitFor(() => {
        expect(screen.queryByText('M')).not.toBeInTheDocument();
        expect(screen.queryByText('A')).not.toBeInTheDocument();
        expect(screen.queryByText('U')).not.toBeInTheDocument();
      });
    });

    it('calls get_files_git_status with buffer paths', async () => {
      seedBuffers([
        { filePath: '/home/user/myproject/src/a.ts' },
        { filePath: '/home/user/myproject/src/b.ts' },
      ]);

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'get_files_git_status') return Promise.resolve({});
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      render(Telescope, { mode: 'buffers' });

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

    it('renders buffer file names from openBuffers', async () => {
      seedBuffers([
        { filePath: '/home/user/myproject/src/alpha.ts' },
        { filePath: '/home/user/myproject/src/beta.svelte' },
      ]);

      mockInvoke.mockResolvedValue({});

      render(Telescope, { mode: 'buffers' });

      await waitFor(() => {
        expect(screen.getByText('alpha.ts')).toBeInTheDocument();
        expect(screen.getByText('beta.svelte')).toBeInTheDocument();
      });
    });
  });

  // ── item list style: result-item classes ─────────────────────────────────────

  describe('item list styling', () => {
    it('result items have result-item class (consistent list style)', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'search_files') return Promise.resolve(makeFileResults());
        if (cmd === 'get_files_git_status') return Promise.resolve({});
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      const { container } = render(Telescope, { mode: 'files' });
      const input = screen.getByPlaceholderText('Search...');
      await fireEvent.input(input, { target: { value: 'ts' } });

      await waitFor(() => {
        const items = container.querySelectorAll('.result-item');
        expect(items.length).toBeGreaterThan(0);
      });
    });

    it('first item gets result-item--selected class on mount', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'search_files') return Promise.resolve(makeFileResults());
        if (cmd === 'get_files_git_status') return Promise.resolve({});
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      const { container } = render(Telescope, { mode: 'files' });
      const input = screen.getByPlaceholderText('Search...');
      await fireEvent.input(input, { target: { value: 'ts' } });

      await waitFor(() => {
        const selected = container.querySelector('.result-item--selected');
        expect(selected).not.toBeNull();
      });
    });

    it('git status badge is inside the result-item row', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'search_files') return Promise.resolve(makeFileResults());
        if (cmd === 'get_files_git_status') return Promise.resolve({
          '/home/user/myproject/src/main.ts': 'modified',
        });
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      const { container } = render(Telescope, { mode: 'files' });
      const input = screen.getByPlaceholderText('Search...');
      await fireEvent.input(input, { target: { value: 'ts' } });

      await waitFor(() => {
        const badge = screen.getByText('M');
        const item = badge.closest('.result-item');
        expect(item).not.toBeNull();
      });
    });
  });

  // ── keyboard navigation ───────────────────────────────────────────────────────

  describe('keyboard navigation', () => {
    it('Escape calls closeDialog', async () => {
      const { container } = render(Telescope, { mode: 'files' });
      const shell = container.querySelector('[data-dialog-shell]') as HTMLElement;
      await fireEvent.keyDown(shell, { key: 'Escape' });
      expect(closeDialog).toHaveBeenCalledTimes(1);
    });

    it('ArrowDown moves selection to the next item', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'search_files') return Promise.resolve(makeFileResults());
        if (cmd === 'get_files_git_status') return Promise.resolve({});
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      const { container } = render(Telescope, { mode: 'files' });
      const input = screen.getByPlaceholderText('Search...');
      await fireEvent.input(input, { target: { value: 'ts' } });

      await waitFor(() => {
        const items = container.querySelectorAll('.result-item');
        expect(items.length).toBe(2);
      });

      const shell = container.querySelector('[data-dialog-shell]') as HTMLElement;
      await fireEvent.keyDown(shell, { key: 'ArrowDown' });

      await waitFor(() => {
        const selected = container.querySelector('.result-item--selected');
        expect(selected).not.toBeNull();
        // After ArrowDown the second item should be selected
        const items = container.querySelectorAll('.result-item');
        expect(items[1].className).toContain('result-item--selected');
      });
    });

    it('ArrowUp wraps around to last item from first', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'search_files') return Promise.resolve(makeFileResults());
        if (cmd === 'get_files_git_status') return Promise.resolve({});
        if (cmd === 'read_file_lines') return Promise.resolve([]);
        if (cmd === 'detect_language') return Promise.resolve('unknown');
        return Promise.resolve(null);
      });

      const { container } = render(Telescope, { mode: 'files' });
      const input = screen.getByPlaceholderText('Search...');
      await fireEvent.input(input, { target: { value: 'ts' } });

      await waitFor(() => {
        expect(container.querySelectorAll('.result-item').length).toBe(2);
      });

      const shell = container.querySelector('[data-dialog-shell]') as HTMLElement;
      await fireEvent.keyDown(shell, { key: 'ArrowUp' });

      await waitFor(() => {
        const items = container.querySelectorAll('.result-item');
        // Wrapped to last item
        expect(items[items.length - 1].className).toContain('result-item--selected');
      });
    });
  });

  // ── gitStatusStyle helper (via rendered color attributes) ─────────────────────

  describe('gitStatusStyle color mapping', () => {
    const cases: [string, string][] = [
      ['modified',  'var(--forja-ui-git-modified, #fb923c)'],
      ['added',     'var(--forja-ui-git-added, #4ade80)'],
      ['deleted',   'var(--forja-ui-git-deleted, #f87171)'],
      ['renamed',   'var(--forja-ui-git-renamed, #60a5fa)'],
      ['untracked', 'var(--forja-ui-git-untracked, #9a9aaa)'],
    ];

    for (const [status, expectedColor] of cases) {
      it(`badge for ${status} uses color ${expectedColor}`, async () => {
        mockInvoke.mockImplementation((cmd: string) => {
          if (cmd === 'search_files') return Promise.resolve(makeFileResults());
          if (cmd === 'get_files_git_status') return Promise.resolve({
            '/home/user/myproject/src/main.ts': status,
          });
          if (cmd === 'read_file_lines') return Promise.resolve([]);
          if (cmd === 'detect_language') return Promise.resolve('unknown');
          return Promise.resolve(null);
        });

        render(Telescope, { mode: 'files' });
        const input = screen.getByPlaceholderText('Search...');
        await fireEvent.input(input, { target: { value: 'ts' } });

        await waitFor(() => {
          const badge = screen.getByText(GIT_STATUS_LABELS[status]);
          expect(badge.getAttribute('style')).toContain(expectedColor);
        });
      });
    }
  });
});
