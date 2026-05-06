import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/pluginStore', () => ({
  activateThemeByName: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('$lib/stores/uiThemeStore', async () => {
  const { writable, derived } = await import('svelte/store');
  const { THEMES } = await import('$lib/themes/index');

  const allUIThemes = writable(THEMES);
  const activeUIThemeId = writable(THEMES[0].id);
  const activeUITheme = derived([activeUIThemeId, allUIThemes], ([$id, $themes]) => {
    return $themes.find((theme) => theme.id === $id) ?? $themes[0];
  });
  const setUITheme = vi.fn((id: string) => activeUIThemeId.set(id));

  return {
    allUIThemes,
    activeUIThemeId,
    activeUITheme,
    setUITheme,
  };
});

import ThemePicker from '$lib/components/ThemePicker.svelte';
import { THEMES } from '$lib/themes/index';
import { activateThemeByName } from '$lib/stores/pluginStore';
import { activeUIThemeId, setUITheme } from '$lib/stores/uiThemeStore';

describe('ThemePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeUIThemeId.set(THEMES[0].id);
  });

  it('renders the available theme list', () => {
    render(ThemePicker, { onClose: vi.fn() });

    expect(screen.getByText(THEMES[0].name)).toBeInTheDocument();
    expect(screen.getByText(THEMES[1].name)).toBeInTheDocument();
  });

  it('clicking a theme calls setUITheme, activates it, and closes the picker', async () => {
    const onClose = vi.fn();
    render(ThemePicker, { onClose });

    await fireEvent.click(screen.getByText(THEMES[1].name).closest('button')!);

    expect(setUITheme).toHaveBeenCalledWith(THEMES[1].id);
    expect(activateThemeByName).toHaveBeenCalledWith(THEMES[1].id);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ArrowDown followed by Enter selects the highlighted next theme', async () => {
    const onClose = vi.fn();
    const { container } = render(ThemePicker, { onClose });
    const backdrop = container.firstElementChild as HTMLElement;

    await fireEvent.keyDown(backdrop, { key: 'ArrowDown' });
    await fireEvent.keyDown(backdrop, { key: 'Enter' });

    expect(setUITheme).toHaveBeenCalledWith(THEMES[1].id);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ArrowDown then ArrowUp returns focus to the previous item before selection', async () => {
    const onClose = vi.fn();
    const { container } = render(ThemePicker, { onClose });
    const backdrop = container.firstElementChild as HTMLElement;

    await fireEvent.keyDown(backdrop, { key: 'ArrowDown' });
    await fireEvent.keyDown(backdrop, { key: 'ArrowUp' });
    await fireEvent.keyDown(backdrop, { key: 'Enter' });

    expect(setUITheme).toHaveBeenCalledWith(THEMES[0].id);
  });

  it('Escape closes the picker without selecting a theme', async () => {
    const onClose = vi.fn();
    const { container } = render(ThemePicker, { onClose });
    const backdrop = container.firstElementChild as HTMLElement;

    await fireEvent.keyDown(backdrop, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setUITheme).not.toHaveBeenCalled();
  });
});
