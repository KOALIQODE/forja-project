import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/projectStore', async () => {
  const { writable } = await import('svelte/store');

  return {
    recentProjects: writable(['path/to/ProjectA', 'path/to/ProjectB']),
    shortenedPaths: writable(['ProjectA', 'ProjectB']),
    gitStatuses: writable([]),
    openProject: vi.fn(),
  };
});
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: {
    subscribe(fn: (value: { vars: Record<string, string> }) => void) {
      fn({ vars: {} });
      return () => {};
    },
  },
}));

import RecentProjectsDialog from '$lib/components/RecentProjectsDialog.svelte';
import { gitStatuses, openProject, recentProjects, shortenedPaths } from '$lib/stores/projectStore';

describe('RecentProjectsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recentProjects.set(['path/to/ProjectA', 'path/to/ProjectB']);
    shortenedPaths.set(['ProjectA', 'ProjectB']);
    gitStatuses.set([]);
  });

  it('renders the dialog when isOpen is true', () => {
    render(RecentProjectsDialog, { isOpen: true, onClose: vi.fn() });

    expect(screen.getByText('RECENT PROJECTS')).toBeInTheDocument();
  });

  it('shows the recent project names from the last path segment', () => {
    render(RecentProjectsDialog, { isOpen: true, onClose: vi.fn() });

    expect(screen.getAllByText('ProjectA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ProjectB').length).toBeGreaterThan(0);
  });

  it('ArrowDown then Enter opens the highlighted project and closes the dialog', async () => {
    const onClose = vi.fn();
    const { container } = render(RecentProjectsDialog, { isOpen: true, onClose });
    const dialog = container.querySelector('[data-program-ui]') as HTMLElement;

    await fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    await fireEvent.keyDown(dialog, { key: 'Enter' });

    expect(openProject).toHaveBeenCalledWith('path/to/ProjectB');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ArrowDown then ArrowUp restores the first project selection', async () => {
    const onClose = vi.fn();
    const { container } = render(RecentProjectsDialog, { isOpen: true, onClose });
    const dialog = container.querySelector('[data-program-ui]') as HTMLElement;

    await fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    await fireEvent.keyDown(dialog, { key: 'ArrowUp' });
    await fireEvent.keyDown(dialog, { key: 'Enter' });

    expect(openProject).toHaveBeenCalledWith('path/to/ProjectA');
  });

  it('clicking a project opens it and closes the dialog', async () => {
    const onClose = vi.fn();
    render(RecentProjectsDialog, { isOpen: true, onClose });

    await fireEvent.click(screen.getAllByText('ProjectB')[0]);

    expect(openProject).toHaveBeenCalledWith('path/to/ProjectB');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('delete removes a project from the rendered list', async () => {
    const { container } = render(RecentProjectsDialog, { isOpen: true, onClose: vi.fn() });

    await fireEvent.click(screen.getAllByTitle('Remove from recent')[0]);

    expect(container.querySelectorAll('.item-row')).toHaveLength(1);
    expect(screen.getByText('ProjectB')).toBeInTheDocument();
  });
});
