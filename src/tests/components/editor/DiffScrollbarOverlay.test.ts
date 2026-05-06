import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: { subscribe: (fn: any) => { fn({ vars: {} }); return () => {}; } },
}));

import DiffScrollbarOverlay from '$lib/components/editor/DiffScrollbarOverlay.svelte';

describe('DiffScrollbarOverlay', () => {
  it('renders without crashing when hunks is empty', () => {
    const { container } = render(DiffScrollbarOverlay, {
      hunks: [],
      totalLines: 100,
      editorLineHeight: 20,
      scrollContainer: null,
    });

    expect(container.querySelector('.scrollbar-diff-overlay')).toBeInTheDocument();
    expect(container.querySelectorAll('.scrollbar-diff-mark')).toHaveLength(0);
  });

  it('renders one marker per hunk', () => {
    const hunks = [
      { status: 'added', newStart: 5, newEnd: 8, afterLine: 4 },
      { status: 'deleted', newStart: 0, newEnd: 0, afterLine: 20 },
      { status: 'modified', newStart: 30, newEnd: 33, afterLine: 29 },
    ];

    const { container } = render(DiffScrollbarOverlay, {
      hunks,
      totalLines: 100,
      editorLineHeight: 20,
      scrollContainer: null,
    });

    expect(container.querySelectorAll('.scrollbar-diff-mark')).toHaveLength(3);
  });

  it('clicking a marker updates scrollContainer.scrollTop', async () => {
    const scrollContainer = { clientHeight: 200, scrollTop: 0 } as HTMLElement;
    const hunks = [{ status: 'modified', newStart: 10, newEnd: 12, afterLine: 9 }];

    const { container } = render(DiffScrollbarOverlay, {
      hunks,
      totalLines: 100,
      editorLineHeight: 20,
      scrollContainer,
    });

    const marker = container.querySelector('.scrollbar-diff-mark') as HTMLElement;
    await fireEvent.pointerDown(marker);

    expect(scrollContainer.scrollTop).toBe(100);
  });
});
