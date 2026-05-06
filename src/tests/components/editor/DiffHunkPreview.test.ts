import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: { subscribe: (fn: any) => { fn({ vars: {} }); return () => {}; } },
}));

import DiffHunkPreview from '$lib/components/editor/DiffHunkPreview.svelte';

describe('DiffHunkPreview', () => {
  it('does not render when visible is false', () => {
    const { container } = render(DiffHunkPreview, {
      visible: false,
      html: '<div>preview</div>',
      screenX: 10,
      screenY: 20,
    });

    expect(container.querySelector('.diff-hunk-preview')).toBeNull();
  });

  it('renders when visible is true at the provided coordinates', () => {
    const { container } = render(DiffHunkPreview, {
      visible: true,
      html: '<div>preview</div>',
      screenX: 120,
      screenY: 64,
    });

    const preview = container.querySelector('.diff-hunk-preview');
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveAttribute('style', expect.stringContaining('top: 64px; left: 120px'));
  });

  it('renders HTML content via @html', () => {
    const { container } = render(DiffHunkPreview, {
      visible: true,
      html: '<div class="diff-preview-line"><span>added line</span></div>',
      screenX: 0,
      screenY: 0,
    });

    expect(container.querySelector('.diff-preview-line')).toBeInTheDocument();
    expect(container).toHaveTextContent('added line');
  });
});
