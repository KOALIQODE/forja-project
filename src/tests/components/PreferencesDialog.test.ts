import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock('$lib/stores/dialogStore', () => ({
  closeDialog: vi.fn(),
}));
vi.mock('$lib/stores/uiThemeStore', () => ({
  activeUITheme: {
    subscribe(fn: (value: { vars: Record<string, string> }) => void) {
      fn({ vars: {} });
      return () => {};
    },
  },
}));
vi.mock('$lib/stores/preferencesStore', async () => {
  const { writable } = await import('svelte/store');

  return {
    PROGRAM_FONT_OPTIONS: [
      { label: 'Montserrat', value: 'Montserrat' },
      { label: 'System UI', value: 'System UI' },
    ],
    BUFFER_FONT_OPTIONS: [
      { label: 'JetBrains Mono', value: 'JetBrains Mono' },
      { label: 'Fira Code', value: 'Fira Code' },
    ],
    programPreferences: writable({
      fontFamily: 'Montserrat',
      fontSize: 12,
      explorerWidth: 260,
      reduceMotion: false,
    }),
    bufferPreferences: writable({
      fontFamily: 'JetBrains Mono',
      fontSize: 13,
      lineHeight: 22,
      vimModeEnabled: false,
      showLineNumbers: true,
      highlightActiveLine: true,
      softWrapEnabled: true,
    }),
    setProgramPreference: vi.fn(),
    setBufferPreference: vi.fn(),
    resetProgramPreferences: vi.fn(),
    resetBufferPreferences: vi.fn(),
  };
});

import PreferencesDialog from '$lib/components/dialogs/PreferencesDialog.svelte';
import { closeDialog } from '$lib/stores/dialogStore';
import {
  bufferPreferences,
  programPreferences,
  resetProgramPreferences,
  setProgramPreference,
} from '$lib/stores/preferencesStore';

describe('PreferencesDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    programPreferences.set({
      fontFamily: 'Montserrat',
      fontSize: 12,
      explorerWidth: 260,
      reduceMotion: false,
    });
    bufferPreferences.set({
      fontFamily: 'JetBrains Mono',
      fontSize: 13,
      lineHeight: 22,
      vimModeEnabled: false,
      showLineNumbers: true,
      highlightActiveLine: true,
      softWrapEnabled: true,
    });
  });

  it('renders the program preferences tab with font size and font family controls', () => {
    const { container } = render(PreferencesDialog);

    expect(screen.getByText('Preferencias del programa')).toBeInTheDocument();
    expect(container.querySelector('#program-font-family')).toBeInTheDocument();
    expect(container.querySelector('#program-font-size')).toBeInTheDocument();
  });

  it('renders the buffer preferences tab with font size, line height, and vim mode controls', () => {
    const { container } = render(PreferencesDialog, { initialSection: 'buffer' });

    expect(screen.getByText('Preferencias del buffer')).toBeInTheDocument();
    expect(container.querySelector('#buffer-font-size')).toBeInTheDocument();
    expect(container.querySelector('#buffer-line-height')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle vim mode')).toBeInTheDocument();
  });

  it('changing the program font size input calls setProgramPreference', async () => {
    const { container } = render(PreferencesDialog);
    const input = container.querySelector('#program-font-size') as HTMLInputElement;

    await fireEvent.input(input, { target: { value: '16' } });

    expect(setProgramPreference).toHaveBeenCalledWith('fontSize', 16);
  });

  it('clicking reset calls resetProgramPreferences on the program section', async () => {
    render(PreferencesDialog);

    await fireEvent.click(screen.getByText('Reset'));

    expect(resetProgramPreferences).toHaveBeenCalledTimes(1);
  });

  it('clicking the close button calls closeDialog', async () => {
    const { container } = render(PreferencesDialog);
    const closeButton = container.querySelector('.close-btn') as HTMLButtonElement;

    await fireEvent.click(closeButton);

    expect(closeDialog).toHaveBeenCalledTimes(1);
  });
});
