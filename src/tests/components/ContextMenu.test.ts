import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import ContextMenu from '$lib/components/ContextMenu.svelte';

function renderMenu() {
  const openClick = vi.fn();
  const deleteClick = vi.fn();
  const separatorClick = vi.fn();
  const close = vi.fn();

  const utils = render(ContextMenu, {
    x: 16,
    y: 24,
    close,
    options: [
      { label: 'Open', onClick: openClick },
      { label: 'Delete', onClick: deleteClick, danger: true },
      { label: 'separator', onClick: separatorClick, separator: true },
    ],
  });

  return { ...utils, openClick, deleteClick, separatorClick, close };
}

describe('ContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        onfinish: null,
        cancel() {},
        finished: Promise.resolve(),
      })),
    });
  });

  it('renders all non-separator option labels passed via props', () => {
    renderMenu();

    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('clicking an option calls its handler and then closes the menu', async () => {
    const { openClick, close } = renderMenu();

    await fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(openClick).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('pressing Escape calls close', async () => {
    const { close } = renderMenu();

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('clicking outside the menu calls close', async () => {
    const { close } = renderMenu();

    await fireEvent.mouseDown(document.body);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('renders danger styling for danger options', () => {
    renderMenu();

    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('text-red-400');
  });

  it('renders a separator and does not invoke separator callbacks when clicked', async () => {
    const { container, separatorClick, close } = renderMenu();
    const separator = container.querySelector('.my-1');

    expect(separator).toBeInTheDocument();

    await fireEvent.click(separator!);

    expect(separatorClick).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
